// Custom Alert & Confirm Components
import React, { useState, useEffect } from 'react';
import { registerAlertFunctions } from './alertHelpers';
import './CustomAlert.css';

interface AlertState {
  isOpen: boolean;
  message: string;
  type: 'alert' | 'confirm';
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const CustomAlert: React.FC = () => {
  const [state, setState] = useState<AlertState>({
    isOpen: false,
    message: '',
    type: 'alert',
  });

  useEffect(() => {
    const showAlertFn = (message: string) => {
      setState({
        isOpen: true,
        message,
        type: 'alert',
      });
    };

    const showConfirmFn = (message: string, onConfirm: () => void) => {
      setState({
        isOpen: true,
        message,
        type: 'confirm',
        onConfirm,
      });
    };

    registerAlertFunctions(showAlertFn, showConfirmFn);
  }, []);

  const handleConfirm = () => {
    if (state.onConfirm) {
      state.onConfirm();
    }
    setState({ ...state, isOpen: false });
  };

  const handleCancel = () => {
    setState({ ...state, isOpen: false });
  };

  if (!state.isOpen) return null;

  return (
    <div className="custom-alert-overlay" onClick={handleCancel}>
      <div className="custom-alert-container" onClick={(e) => e.stopPropagation()}>
        <div className="custom-alert-header">
          <div className="custom-alert-title">
            {state.type === 'confirm' ? '확인' : '알림'}
          </div>
          <div className="custom-alert-message">{state.message}</div>
        </div>
        <div className="custom-alert-actions">
          {state.type === 'confirm' ? (
            <>
              <button className="custom-alert-btn custom-alert-btn-secondary" onClick={handleCancel}>
                취소
              </button>
              <button className="custom-alert-btn custom-alert-btn-primary" onClick={handleConfirm}>
                확인
              </button>
            </>
          ) : (
            <button className="custom-alert-btn custom-alert-btn-primary" onClick={handleCancel} style={{ gridColumn: '1 / -1' }}>
              확인
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

