import { STL_TUBE_RADIUS_MM } from './stlScale.js';
import { sanitizeSTLFilename } from './stlKitMetadata.js';
import { vecDistance, vecNormalise, vecScale } from './stlVectorMath.js';

export const HOLE_TOLERANCE = 0.15;
export const HOLE_RADIUS = STL_TUBE_RADIUS_MM + HOLE_TOLERANCE;
export const TUBE_INSERTION_DEPTH = 4;
export const HOLE_CLUSTER_CLEARANCE = 0.4;
export const Y_JUNCTION_OUTSIDE = 4.5;

export function clusterHoleEndpoints(endpoints, sphereRadius, forcedGroups = []) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return [];

  const overlapLimit = 2 * HOLE_RADIUS + HOLE_CLUSTER_CLEARANCE;
  const parent = endpoints.map((_, index) => index);

  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };

  const union = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };

  for (let index = 0; index < endpoints.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < endpoints.length; otherIndex += 1) {
      const centreA = vecScale(endpoints[index].dir, sphereRadius);
      const centreB = vecScale(endpoints[otherIndex].dir, sphereRadius);
      if (vecDistance(centreA, centreB) < overlapLimit) {
        union(index, otherIndex);
      }
    }
  }

  const indexByConnectionId = new Map();
  endpoints.forEach((endpoint, index) => {
    indexByConnectionId.set(endpoint.connectionId, index);
  });

  for (const group of forcedGroups || []) {
    if (!Array.isArray(group)) continue;
    const indexes = group
      .map(connectionId => indexByConnectionId.get(connectionId))
      .filter(Number.isInteger);

    for (let index = 1; index < indexes.length; index += 1) {
      union(indexes[0], indexes[index]);
    }
  }

  const clustersByRoot = new Map();
  for (let index = 0; index < endpoints.length; index += 1) {
    const root = find(index);
    let bucket = clustersByRoot.get(root);
    if (!bucket) {
      bucket = [];
      clustersByRoot.set(root, bucket);
    }
    bucket.push(endpoints[index]);
  }

  return Array.from(clustersByRoot.values());
}

export function getClusterMergedDirection(cluster) {
  let sx = 0;
  let sy = 0;
  let sz = 0;

  for (const member of cluster) {
    sx += member.dir[0];
    sy += member.dir[1];
    sz += member.dir[2];
  }

  if (Math.sqrt(sx * sx + sy * sy + sz * sz) < 1e-6) {
    return cluster[0]?.dir || [0, 1, 0];
  }

  return vecNormalise(sx, sy, sz);
}

export function buildSystemSocketPlan(systemName, endpoints, sphereRadius, forcedGroups = []) {
  const connectionClusters = new Map();
  const openingDirections = [];
  const holeCutters = [];
  const clusters = [];

  const groupedClusters = clusterHoleEndpoints(endpoints, sphereRadius, forcedGroups);
  for (let index = 0; index < groupedClusters.length; index += 1) {
    const cluster = groupedClusters[index];
    const merged = cluster.length > 1;
    const holeDir = merged ? getClusterMergedDirection(cluster) : cluster[0].dir;
    const anchorLocal = vecScale(holeDir, sphereRadius - TUBE_INSERTION_DEPTH);
    const pieceLocal = merged
      ? vecScale(holeDir, sphereRadius + Y_JUNCTION_OUTSIDE)
      : anchorLocal;
    const clusterId = `${sanitizeSTLFilename(systemName)}__${index}`;
    const connectionIds = [];

    openingDirections.push(holeDir);
    holeCutters.push({
      holeDir,
      innerDist: sphereRadius - TUBE_INSERTION_DEPTH,
      outerDist: sphereRadius + 1
    });

    for (const member of cluster) {
      connectionClusters.set(member.connectionId, clusterId);
      connectionIds.push(member.connectionId);
    }

    clusters.push({
      id: clusterId,
      systemName,
      merged,
      holeDir,
      anchorLocal,
      pieceLocal,
      connectionIds
    });
  }

  return { connectionClusters, clusters, openingDirections, holeCutters };
}

export function buildEndpointMap(connections) {
  const endpointMap = new Map();

  for (const conn of connections) {
    if (!endpointMap.has(conn.sysA)) endpointMap.set(conn.sysA, []);
    if (!endpointMap.has(conn.sysB)) endpointMap.set(conn.sysB, []);
    endpointMap.get(conn.sysA).push({ connectionId: conn.id, dir: conn.dirA, otherSystem: conn.sysB });
    endpointMap.get(conn.sysB).push({ connectionId: conn.id, dir: conn.dirB, otherSystem: conn.sysA });
  }

  return endpointMap;
}

export function buildSystemSocketPlans(systemInfo, connections, forcedMergeMap = new Map()) {
  const endpointMap = buildEndpointMap(connections);
  const plans = new Map();

  for (const [systemName, info] of systemInfo) {
    plans.set(
      systemName,
      buildSystemSocketPlan(
        systemName,
        endpointMap.get(systemName) || [],
        info.radius,
        forcedMergeMap.get(systemName) || []
      )
    );
  }

  return plans;
}

export function toWorldPoint(info, localPoint) {
  return [
    info.posMM.x + localPoint[0],
    info.posMM.y + localPoint[1],
    info.posMM.z + localPoint[2]
  ];
}

export function buildClusterWorldMap(systemInfo, socketPlans) {
  const clusterMap = new Map();

  for (const [systemName, plan] of socketPlans) {
    const info = systemInfo.get(systemName);
    if (!info) continue;

    for (const cluster of plan.clusters) {
      clusterMap.set(cluster.id, {
        ...cluster,
        rank: info.rank,
        anchorWorld: toWorldPoint(info, cluster.anchorLocal),
        pieceWorld: toWorldPoint(info, cluster.pieceLocal)
      });
    }
  }

  return clusterMap;
}

export function buildTubeComponents(systemInfo, socketPlans, connections) {
  const clusterMap = buildClusterWorldMap(systemInfo, socketPlans);
  const edges = [];
  const adjacency = new Map();

  const touch = (clusterId, edgeIndex) => {
    let bucket = adjacency.get(clusterId);
    if (!bucket) {
      bucket = [];
      adjacency.set(clusterId, bucket);
    }
    bucket.push(edgeIndex);
  };

  for (const conn of connections) {
    const planA = socketPlans.get(conn.sysA);
    const planB = socketPlans.get(conn.sysB);
    const clusterIdA = planA?.connectionClusters.get(conn.id);
    const clusterIdB = planB?.connectionClusters.get(conn.id);
    if (!clusterIdA || !clusterIdB) continue;

    const clusterA = clusterMap.get(clusterIdA);
    const clusterB = clusterMap.get(clusterIdB);
    if (!clusterA || !clusterB) continue;

    const edgeIndex = edges.length;
    edges.push({
      id: conn.id,
      clusterIdA,
      clusterIdB,
      pointA: clusterA.pieceWorld,
      pointB: clusterB.pieceWorld
    });
    touch(clusterIdA, edgeIndex);
    touch(clusterIdB, edgeIndex);
  }

  const visited = new Set();
  const components = [];

  for (const startClusterId of adjacency.keys()) {
    if (visited.has(startClusterId)) continue;

    const queue = [startClusterId];
    visited.add(startClusterId);
    const clusterIds = new Set();
    const edgeIndexes = new Set();

    while (queue.length) {
      const clusterId = queue.shift();
      clusterIds.add(clusterId);

      for (const edgeIndex of adjacency.get(clusterId) || []) {
        edgeIndexes.add(edgeIndex);
        const edge = edges[edgeIndex];
        const otherId = edge.clusterIdA === clusterId ? edge.clusterIdB : edge.clusterIdA;
        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }
    }

    const componentClusters = Array.from(clusterIds)
      .map(clusterId => clusterMap.get(clusterId))
      .filter(Boolean);
    const componentEdges = Array.from(edgeIndexes).map(index => edges[index]);

    if (componentClusters.length && componentEdges.length) {
      components.push({
        clusters: componentClusters,
        edges: componentEdges,
        clusterMap: new Map(componentClusters.map(cluster => [cluster.id, cluster]))
      });
    }
  }

  return components;
}

export function mergeConnectionGroups(groups) {
  const parent = new Map();

  const ensure = (id) => {
    if (!parent.has(id)) parent.set(id, id);
  };

  const find = (id) => {
    ensure(id);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };

  const union = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent.set(rootRight, rootLeft);
  };

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const uniqueIds = Array.from(new Set(group)).sort((a, b) => a - b);
    if (uniqueIds.length < 2) continue;
    for (let index = 1; index < uniqueIds.length; index += 1) {
      union(uniqueIds[0], uniqueIds[index]);
    }
  }

  const buckets = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    let bucket = buckets.get(root);
    if (!bucket) {
      bucket = [];
      buckets.set(root, bucket);
    }
    bucket.push(id);
  }

  return Array.from(buckets.values())
    .map(group => group.sort((a, b) => a - b))
    .filter(group => group.length > 1)
    .sort((left, right) => left[0] - right[0]);
}

export function buildForcedMergeMap(components) {
  const pendingBySystem = new Map();

  for (const component of components) {
    const clustersBySystem = new Map();

    for (const cluster of component.clusters) {
      let bucket = clustersBySystem.get(cluster.systemName);
      if (!bucket) {
        bucket = [];
        clustersBySystem.set(cluster.systemName, bucket);
      }
      bucket.push(cluster);
    }

    for (const [systemName, clusters] of clustersBySystem) {
      if (clusters.length < 2) continue;

      let bucket = pendingBySystem.get(systemName);
      if (!bucket) {
        bucket = [];
        pendingBySystem.set(systemName, bucket);
      }

      bucket.push(clusters.flatMap(cluster => cluster.connectionIds));
    }
  }

  const forcedMergeMap = new Map();
  for (const [systemName, groups] of pendingBySystem) {
    const mergedGroups = mergeConnectionGroups(groups);
    if (mergedGroups.length) forcedMergeMap.set(systemName, mergedGroups);
  }

  return forcedMergeMap;
}

export function getForcedMergeSignature(forcedMergeMap) {
  return JSON.stringify(
    Array.from(forcedMergeMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([systemName, groups]) => [systemName, groups])
  );
}
