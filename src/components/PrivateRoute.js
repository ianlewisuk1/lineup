import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    sessionStorage.setItem("authRedirect", location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRoute;
