"use client";

import { useState, useEffect } from "react";
import { UserCog, Trash2, Plus, ShieldAlert, Loader2 } from "lucide-react";

type Admin = {
  id: number;
  username: string;
  role: string;
  created_at: string;
};

export default function ProfilesPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const res = await fetch("/api/admins");
      if (!res.ok) {
        if (res.status === 403) throw new Error("ACCESS DENIED: Super Admin clearance required.");
        throw new Error("Failed to fetch profiles.");
      }
      const data = await res.json();
      setAdmins(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create profile.");
      
      setNewUsername("");
      setNewPassword("");
      fetchAdmins();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this profile?")) return;
    try {
      const res = await fetch(`/api/admins/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete profile.");
      fetchAdmins();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[#10b981]" /></div>;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h2 className="text-xl font-mono text-red-500 uppercase tracking-widest">{error}</h2>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
          <UserCog className="w-6 h-6 text-[#10b981]" />
          Personnel Profiles
        </h1>
        <p className="text-xs text-gray-500 font-mono mt-2 uppercase tracking-wider">
          Manage system administrators and operators.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-white/10 bg-[#0a0a0b] p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-white mb-6 border-b border-white/5 pb-4">Active Profiles</h2>
            <div className="space-y-4">
              {admins.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-white text-sm">{admin.username}</span>
                      <span className={`text-[9px] px-2 py-0.5 uppercase tracking-wider font-bold ${admin.role === 'super_admin' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-blue-500/20 text-blue-400'}`}>
                        {admin.role.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1 font-mono">Created: {new Date(admin.created_at).toLocaleString()}</p>
                  </div>
                  <button 
                    onClick={() => handleDelete(admin.id)}
                    className="p-2 hover:bg-red-500/20 text-red-500 transition-colors border border-transparent hover:border-red-500/30"
                    title="Terminate Profile"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-[#10b981]/30 bg-[#10b981]/5 p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#10b981] mb-6 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Provision New Profile
            </h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-black border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-[#10b981] font-mono text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-black border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-[#10b981] font-mono text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">Clearance Level</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-black border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-[#10b981] font-mono text-sm appearance-none"
                >
                  <option value="admin">Operator (Admin)</option>
                  <option value="super_admin">Commander (Super Admin)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/50 py-2 mt-4 text-xs font-mono tracking-widest uppercase transition-colors flex items-center justify-center"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Authorize"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
