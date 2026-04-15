let connectionMaxWidth = 5;
let connectionFadePower = 1.0;
let connectionLabelSize = 1.0;

export function setConnectionLineParams(maxWidth, fadePower, labelSize = 1.0) {
  connectionMaxWidth = maxWidth;
  connectionFadePower = fadePower;
  connectionLabelSize = labelSize;
}

export function getConnectionLineParams() {
  return {
    connectionMaxWidth,
    connectionFadePower,
    connectionLabelSize
  };
}
