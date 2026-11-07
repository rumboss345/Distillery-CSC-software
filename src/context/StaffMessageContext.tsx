import { createContext, useContext, type ReactNode } from 'react';
import { useStaffMessageNotifications } from '../hooks/useStaffMessageNotifications';
import { StaffMessagePopup } from '../components/StaffMessagePopup';

type StaffMessageContextValue = ReturnType<typeof useStaffMessageNotifications>;

const StaffMessageContext = createContext<StaffMessageContextValue | null>(null);

export function StaffMessageProvider({ children }: { children: ReactNode }) {
  const value = useStaffMessageNotifications();
  return (
    <StaffMessageContext.Provider value={value}>
      {value.popup && (
        <StaffMessagePopup
          message={value.popup}
          onDismiss={value.dismissPopup}
          onMarkRead={() => void value.markPopupRead()}
        />
      )}
      {children}
    </StaffMessageContext.Provider>
  );
}

export function useStaffMessageContext(): StaffMessageContextValue {
  const ctx = useContext(StaffMessageContext);
  if (!ctx) {
    throw new Error('useStaffMessageContext must be used within StaffMessageProvider');
  }
  return ctx;
}
