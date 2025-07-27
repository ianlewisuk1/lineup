import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { getDoc, doc } from "firebase/firestore";
import AdminUserPanel from "../components/AdminUserPanel";
import AdminLeaguePanel from "../components/AdminLeaguePanel";

function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return navigate("/login");
      }

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists() || !userSnap.data().isAdmin) {
        console.log("Unauthorized access attempt.");
        return navigate("/");
      }

      setLoading(false);
    };

    fetchData();
  }, [navigate]);

  if (loading) return <p>Loading admin panel...</p>;

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Admin Panel</h2>

      <AdminUserPanel />
      <AdminLeaguePanel />
    </div>
  );
}

export default AdminPanel;
