import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    // if no current user, store the intended URL to session storage
    sessionStorage.setItem("authRedirect", location.pathname + location.search);
    // hard redirect to /login
    return <Navigate to="/login" replace />;
  }
  // if there IS a user, render the child component. 
  return children;
}

export default PrivateRoute;
