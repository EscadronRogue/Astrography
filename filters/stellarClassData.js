let stellarClassData = {};
let stellarClassDataPromise = null;

export async function loadStellarClassData() {
  if (stellarClassDataPromise) return stellarClassDataPromise;
  stellarClassDataPromise = fetch('./stellar_class.json')
    .then(response => {
      if (!response.ok) throw new Error(`Failed to fetch stellar_class.json: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('stellar_class.json must be an object keyed by stellar class.');
      }
      stellarClassData = Object.freeze({ ...data });
      return stellarClassData;
    })
    .catch(error => {
      stellarClassDataPromise = null;
      console.error('Error loading stellar class data:', error);
      throw error;
    });
  return stellarClassDataPromise;
}

export function getStellarClassData() {
  return stellarClassData;
}
