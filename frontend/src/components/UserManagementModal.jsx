import React, { useState, useEffect } from 'react';
import { X, UserPlus, Users, Trash2, Shield, User, Key, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from './ConfirmModal';
import { UserAvatar } from './UserAvatar';

export const UserManagementModal = ({ isOpen, onClose }) => {
  const { user: currentUser, fetchUsers, createUser, deleteUser, changePassword } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password reset state
  const [resettingUserId, setResettingUserId] = useState(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  // Delete user confirmation state
  const [userToDeleteState, setUserToDeleteState] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const list = await fetchUsers();
      setUsers(list);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setShowAddForm(false);
      setError('');
      setSuccess('');

      const handleGlobalKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newUsername.trim() || !newPassword) {
      setError('Username and password are required.');
      return;
    }

    if (newUsername.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (newPassword.length < 3) {
      setError('Password must be at least 3 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        display_name: newDisplayName.trim() || newUsername.trim(),
      });
      setSuccess(`User "${newUsername}" created successfully!`);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      setShowAddForm(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = (userToDelete) => {
    if (userToDelete.id === currentUser?.id) {
      setError('You cannot delete your own admin account.');
      return;
    }
    setUserToDeleteState(userToDelete);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDeleteState) return;
    try {
      setIsDeletingUser(true);
      setError('');
      setSuccess('');
      await deleteUser(userToDeleteState.id);
      setSuccess(`User "${userToDeleteState.username}" deleted.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setIsDeletingUser(false);
      setUserToDeleteState(null);
    }
  };

  const handleResetPassword = async (userId) => {
    if (!resetPasswordVal || resetPasswordVal.length < 3) {
      setError('Password must be at least 3 characters.');
      return;
    }

    try {
      setError('');
      setSuccess('');
      await changePassword(userId, resetPasswordVal);
      setSuccess('Password updated successfully.');
      setResettingUserId(null);
      setResetPasswordVal('');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-surface-island border border-border-medium rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-medium">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">User Management</h2>
              <p className="text-xs text-content-secondary">
                Manage accounts with access to your MattLab Music server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Alerts */}
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-brand-500/15 border border-brand-500/30 rounded-xl flex items-center gap-2.5 text-brand-500 text-xs">
              <Check size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Add User Bar / Toggle */}
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">
              Registered Accounts ({users.length})
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition hover:scale-105 active:scale-95 shadow"
            >
              <UserPlus size={14} />
              <span>{showAddForm ? 'Cancel' : 'Add New User'}</span>
            </button>
          </div>

          {/* Add User Form */}
          {showAddForm && (
            <form
              onSubmit={handleCreateUser}
              className="p-4 bg-surface-panel border border-border-medium rounded-xl space-y-3.5 animate-in fade-in duration-150"
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus size={16} className="text-brand-500" />
                <span>Create New User</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. sarah"
                    required
                    className="w-full bg-surface-elevated2 border border-border-medium rounded-lg px-3 py-2 text-xs text-white placeholder:text-content-subtle outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-surface-elevated2 border border-border-medium rounded-lg px-3 py-2 text-xs text-white placeholder:text-content-subtle outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                    className="w-full bg-surface-elevated2 border border-border-medium rounded-lg px-3 py-2 text-xs text-white placeholder:text-content-subtle outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-surface-elevated2 border border-border-medium rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                  >
                    <option value="user">User (Stream & Playlists)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-content-secondary hover:text-white hover:bg-surface-hover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create User</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* User List Table */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-content-subtle">
              <Loader2 size={24} className="animate-spin mb-2 text-brand-500" />
              <span className="text-xs">Loading user list...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-subtle">
              No users registered.
            </div>
          ) : (
            <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-surface-panel">
              {users.map((u) => {
                const isCurrent = u.id === currentUser?.id;
                const isAdmin = u.role === 'admin';

                return (
                  <div key={u.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-hover transition">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={u} size="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {u.display_name || u.username}
                          </span>
                          <span className="text-xs text-content-subtle">
                            @{u.username}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] bg-white/10 text-content-secondary px-1.5 py-0.5 rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-content-subtle mt-0.5">
                          <span>
                            Last login: {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Role Badge */}
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isAdmin 
                          ? 'bg-brand-500/15 text-brand-500 border border-brand-500/30' 
                          : 'bg-white/5 text-content-secondary border border-white/10'
                      }`}>
                        {isAdmin ? <Shield size={11} /> : <User size={11} />}
                        <span>{isAdmin ? 'Admin' : 'User'}</span>
                      </span>

                      {/* Password Reset Trigger */}
                      {resettingUserId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="password"
                            placeholder="New pass"
                            value={resetPasswordVal}
                            onChange={(e) => setResetPasswordVal(e.target.value)}
                            className="w-24 bg-surface-elevated2 border border-white/20 rounded px-2 py-0.5 text-xs text-white"
                          />
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            className="bg-brand-500 text-black px-2 py-0.5 rounded text-xs font-bold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setResettingUserId(null); setResetPasswordVal(''); }}
                            className="text-content-secondary text-xs px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setResettingUserId(u.id); setResetPasswordVal(''); }}
                          title="Reset Password"
                          className="p-1.5 rounded-lg text-content-subtle hover:text-white hover:bg-white/5 transition"
                        >
                          <Key size={14} />
                        </button>
                      )}

                      {/* Delete Button */}
                      {!isCurrent && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          title="Delete User"
                          className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(userToDeleteState)}
        title={`Delete user "${userToDeleteState?.username}"?`}
        message="This will permanently delete this user account. This action cannot be undone."
        confirmText="Delete User"
        onConfirm={handleConfirmDeleteUser}
        onClose={() => setUserToDeleteState(null)}
        isLoading={isDeletingUser}
      />
    </div>
  );
};
