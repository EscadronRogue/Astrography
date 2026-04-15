export function setupEditIOControls(manager) {
  const dlBtn = document.getElementById('download-edits');
  if (dlBtn) {
    dlBtn.addEventListener('click', () => manager.downloadLabelEdits());
  }
  const upBtn = document.getElementById('upload-edits');
  const fileInput = document.getElementById('upload-edits-input');
  if (upBtn && fileInput) {
    upBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        manager.applyLabelEdits(data);
      } catch {
        alert('Invalid edits file');
      }
      fileInput.value = '';
    });
  }
}
