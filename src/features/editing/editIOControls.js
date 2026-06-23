import { notifyError } from '../../shared/userNotifications.js';
import { readTextFile } from '../../shared/fileUtils.js';
import { logError } from '../../shared/logger.js';

export function setupEditIOControls(manager) {
  const dlBtn = document.getElementById('download-edits');
  if (dlBtn) {
    manager.addManagedEventListener(dlBtn, 'click', () => manager.downloadLabelEdits());
  }
  const upBtn = document.getElementById('upload-edits');
  const fileInput = document.getElementById('upload-edits-input');
  if (upBtn && fileInput) {
    manager.addManagedEventListener(upBtn, 'click', () => fileInput.click());
    manager.addManagedEventListener(fileInput, 'change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await readTextFile(file);
        const data = JSON.parse(text);
        manager.applyLabelEdits(data);
      } catch (error) {
        logError('Invalid edits file:', error);
        notifyError('Invalid edits file', error);
      }
      fileInput.value = '';
    });
  }
}
