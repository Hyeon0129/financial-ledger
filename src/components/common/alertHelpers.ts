// Alert Helper Functions
let showAlertFn: ((message: string) => void) | null = null;
let showConfirmFn: ((message: string, onConfirm: () => void) => void) | null = null;

export const registerAlertFunctions = (
  alertFn: (message: string) => void,
  confirmFn: (message: string, onConfirm: () => void) => void
) => {
  showAlertFn = alertFn;
  showConfirmFn = confirmFn;
};

export const showAlert = (message: string) => {
  if (showAlertFn) {
    showAlertFn(message);
  }
};

export const showConfirm = (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (showConfirmFn) {
      showConfirmFn(message, () => resolve(true));
    } else {
      // Fallback to native confirm if custom alert is not ready
      resolve(window.confirm(message));
    }
  });
};

