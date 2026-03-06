import { Navigate } from "react-router-dom";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const userRole = localStorage.getItem("userRole");

  if (!userRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
