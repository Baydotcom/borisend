import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageLoader from "@/components/loaders/PageLoader";
import { Loader2, Search, ChevronRight, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AdminPageHeader from "@/components/layout/AdminPageHeader";

export default function ManageUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      if (me.role !== "admin" && me.role !== "super_admin") { navigate("/"); return; }
      const u = await base44.entities.User.list("-created_date", 50);
      setUsers(u);
      setLoading(false);
    };
    load();
  }, [navigate]);

  if (loading) {
    return <PageLoader />;
  }

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const roleColors = {
    super_admin: "bg-primary/15 text-primary",
    admin: "bg-info/15 text-info",
    user: "bg-muted text-muted-foreground",
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Manage users" />

      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>

        <div className="space-y-2">
          {filtered.map(user => (
            <button
              key={user.id}
              onClick={() => navigate(`/admin/users/${user.id}`)}
              className="w-full flex items-center gap-3 bg-card border border-border/50 rounded-xl p-4 active:scale-[0.99] transition-transform text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {user.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {user.deletion_requested && (
                  <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive flex items-center gap-1">
                    <UserX className="w-3 h-3" />
                  </Badge>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColors[user.role] || roleColors.user}`}>
                  {user.role || "user"}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}