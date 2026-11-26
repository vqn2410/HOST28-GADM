import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { Card, Button } from '@/components/ui/Primitives';
import type { Permission } from '@/types/domain';

export const ProtectedRoute: React.FC<{
  permission?: Permission;
  children: React.ReactNode;
}> = ({ permission, children }) => {
  const { isAuthenticated, can } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !can(permission)) {
    return (
      <Card className="p-10 max-w-lg mx-auto mt-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>
        <h2 className="text-lg font-bold text-ink-primary">Acceso restringido</h2>
        <p className="text-sm text-ink-secondary mt-2">
          Tu rol actual no cuenta con el permiso necesario (<code className="font-mono text-xs">{permission}</code>) para acceder a esta sección.
        </p>
        <div className="mt-5">
          <Button variant="outline" onClick={() => window.history.back()}>
            Volver
          </Button>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
};
