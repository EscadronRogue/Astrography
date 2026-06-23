import { fetchWithTimeout } from '../../../data/fetchWithTimeout.js';
import { validateStellarClassData } from '../../../data/dataValidation.js';

let stellarClassData = {};
let stellarClassDataPromise = null;

export async function loadStellarClassData() {
  if (stellarClassDataPromise) return stellarClassDataPromise;
  stellarClassDataPromise = fetchWithTimeout('./stellar_class.json')
    .then(response => {
      if (!response.ok) throw new Error(`Failed to fetch stellar_class.json: ${response.status}`);
      return response.json();
    })
    .then(data => {
      stellarClassData = Object.freeze(validateStellarClassData(data, 'stellar_class.json'));
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
