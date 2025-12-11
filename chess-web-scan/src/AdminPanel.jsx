import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from './config/api';

const AdminPanel = ({ onNavigate, onLogout }) => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsPerPage = 50;

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      // Fallback logout
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      onNavigate('home');
    }
  };

  // Check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      onNavigate('login');
      return;
    }

    // Decode token to check username
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.username !== 'admin') {
        alert('Access denied. Admin only.');
        onNavigate('home');
      }
    } catch (e) {
      onNavigate('login');
    }
  }, [onNavigate]);

  // Fetch audit logs
  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const offset = (currentPage - 1) * logsPerPage;

      let url = `${API_BASE_URL}/admin/audit-logs?limit=${logsPerPage}&offset=${offset}`;
      if (filter !== 'all') {
        url += `&action_type=${filter}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      const data = await response.json();
      setLogs(data.logs);
      setTotalLogs(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/admin/audit-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [filter, currentPage]);

  const formatDate = (dateString) => {
    // SQLite returns UTC time without 'Z' suffix, so we need to add it
    // to ensure JavaScript treats it as UTC
    const utcDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const date = new Date(utcDateString);

    // Convert to Indian Standard Time (IST)
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getActionBadgeColor = (actionType) => {
    switch (actionType) {
      case 'image_scan':
        return 'bg-blue-500';
      case 'move_evaluation':
        return 'bg-green-500';
      case 'position_analysis':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadgeColor = (status) => {
    return status === 'success' ? 'bg-green-600' : 'bg-red-600';
  };

  const totalPages = Math.ceil(totalLogs / logsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Admin Panel</h1>
            <p className="text-gray-400">Audit Logs & System Statistics</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-semibold"
          >
            Logout
          </button>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Total Logs</div>
              <div className="text-3xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Image Scans</div>
              <div className="text-3xl font-bold text-blue-400">
                {stats.by_action_type.image_scan}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Move Evaluations</div>
              <div className="text-3xl font-bold text-green-400">
                {stats.by_action_type.move_evaluation}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Position Analysis</div>
              <div className="text-3xl font-bold text-purple-400">
                {stats.by_action_type.position_analysis}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
          <div className="flex items-center gap-4">
            <label className="text-gray-400 font-medium">Filter by action:</label>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Actions</option>
              <option value="image_scan">Image Scans</option>
              <option value="move_evaluation">Move Evaluations</option>
              <option value="position_analysis">Position Analysis</option>
            </select>
            <button
              onClick={() => {
                fetchLogs();
                fetchStats();
              }}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-400">Loading logs...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={fetchLogs}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
            <p className="text-gray-400">No logs found</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Time</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Action</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">User</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">IP Address</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-400">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-700/50 transition">
                        <td className="px-4 py-3 text-sm text-gray-300">{log.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${getActionBadgeColor(
                              log.action_type
                            )}`}
                          >
                            {log.action_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {log.username || <span className="text-gray-500 italic">anonymous</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                          {log.ip_address}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${getStatusBadgeColor(
                              log.status
                            )}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.details && (
                            <details className="cursor-pointer">
                              <summary className="text-blue-400 hover:text-blue-300">
                                View Details
                              </summary>
                              <pre className="mt-2 p-2 bg-gray-900 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg transition"
                >
                  Previous
                </button>
                <span className="px-4 py-2 bg-gray-800 rounded-lg">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
