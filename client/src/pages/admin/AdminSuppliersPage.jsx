/**
 * CoBuy AI — Supplier Moderation & Provenance Workspace (SUJ-09 / SRU-10)
 *
 * Route: /admin/suppliers
 * Access: ADMIN (Full edit), REVIEWER (Read-only)
 *
 * Features:
 *  - Searchable, paginated directory of registered and catalogue suppliers
 *  - Verification status moderation (VERIFIED, UNVERIFIED, DEMO_ONLY, UNDER_REVIEW)
 *  - Active lifecycle status moderation (ACTIVE, INACTIVE, SUSPENDED)
 *  - Provenance auditing (SEEDED_DEMO, SUPPLIER_SUBMITTED, VERIFIED_LIVE, EXTERNAL_API)
 *  - Supplier profile creation & metadata update via PATCH /api/admin/suppliers/:id
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Search,
  Plus,
  Edit3,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Eye,
  Lock,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  User,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  listSuppliersForAdmin,
  updateSupplier,
  createSupplier,
} from '@/api/admin.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

const VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'DEMO_ONLY', 'UNDER_REVIEW'];
const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
const DATA_SOURCE_TYPES = ['SEEDED_DEMO', 'SUPPLIER_SUBMITTED', 'VERIFIED_LIVE', 'EXTERNAL_API'];

const AVAILABLE_SERVICE_AREAS = [
  'DELHI_NCR',
  'MUMBAI',
  'BANGALORE_URBAN',
  'LUCKNOW',
  'KANPUR',
  'VARANASI',
  'ALL_INDIA',
];

export function AdminSuppliersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const isAdmin = user?.role === 'ADMIN';
  const isReviewer = user?.role === 'REVIEWER';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState({ totalCount: 0, page: 1, limit: 20, totalPages: 1 });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [selectedVerification, setSelectedVerification] = useState('ALL');
  const [selectedActive, setSelectedActive] = useState('ALL');
  const [selectedDataSource, setSelectedDataSource] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Edit Supplier Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    verificationStatus: 'VERIFIED',
    activeStatus: 'ACTIVE',
    dataSourceType: 'VERIFIED_LIVE',
    serviceAreas: ['DELHI_NCR'],
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    panNumber: '',
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Create Supplier Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    verificationStatus: 'VERIFIED',
    dataSourceType: 'VERIFIED_LIVE',
    serviceAreas: ['DELHI_NCR'],
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
  });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: currentPage,
        limit: 20,
        activeStatus: selectedActive,
      };

      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedArea !== 'ALL') params.serviceArea = selectedArea;
      if (selectedVerification !== 'ALL') params.verificationStatus = selectedVerification;
      if (selectedDataSource !== 'ALL') params.dataSourceType = selectedDataSource;

      const data = await listSuppliersForAdmin(params);
      setSuppliers(data.suppliers || []);
      setPagination(data.pagination || { totalCount: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, selectedArea, selectedVerification, selectedActive, selectedDataSource]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Handle Open Edit Modal
  const handleOpenEdit = (sup) => {
    if (!isAdmin) return;
    setEditingSupplier(sup);
    setEditForm({
      name: sup.name || '',
      verificationStatus: sup.verificationStatus || 'VERIFIED',
      activeStatus: sup.activeStatus || 'ACTIVE',
      dataSourceType: sup.dataSourceType || 'VERIFIED_LIVE',
      serviceAreas: Array.isArray(sup.serviceAreas) ? sup.serviceAreas : ['DELHI_NCR'],
      contactPerson: sup.contactReference?.contactPerson || '',
      phone: sup.contactReference?.phone || '',
      email: sup.contactReference?.email || '',
      address: sup.contactReference?.address || '',
      gstNumber: sup.contactReference?.gstNumber || '',
      panNumber: sup.contactReference?.panNumber || '',
    });
    setEditModalOpen(true);
  };

  // Handle Save Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSupplier || !isAdmin) return;

    if (!editForm.name.trim()) {
      notify?.('Supplier name is required.', 'error');
      return;
    }
    if (!editForm.serviceAreas || editForm.serviceAreas.length === 0) {
      notify?.('At least one service area is required.', 'error');
      return;
    }

    try {
      setSubmittingEdit(true);
      const payload = {
        name: editForm.name.trim(),
        verificationStatus: editForm.verificationStatus,
        activeStatus: editForm.activeStatus,
        dataSourceType: editForm.dataSourceType,
        serviceAreas: editForm.serviceAreas,
        contactReference: {
          contactPerson: editForm.contactPerson.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          address: editForm.address.trim(),
          gstNumber: editForm.gstNumber.trim(),
          panNumber: editForm.panNumber.trim(),
        },
      };

      await updateSupplier(editingSupplier._id, payload);
      notify?.(`Supplier "${editForm.name}" updated successfully.`, 'success');
      setEditModalOpen(false);
      setEditingSupplier(null);
      await fetchSuppliers();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to update supplier.', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Handle Save Create
  const handleSaveCreate = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!createForm.name.trim()) {
      notify?.('Supplier company name is required.', 'error');
      return;
    }
    if (!createForm.serviceAreas || createForm.serviceAreas.length === 0) {
      notify?.('Please select at least one service area.', 'error');
      return;
    }

    try {
      setSubmittingCreate(true);
      const payload = {
        name: createForm.name.trim(),
        verificationStatus: createForm.verificationStatus,
        dataSourceType: createForm.dataSourceType,
        serviceAreas: createForm.serviceAreas,
        contactReference: {
          contactPerson: createForm.contactPerson.trim(),
          phone: createForm.phone.trim(),
          email: createForm.email.trim(),
          address: createForm.address.trim(),
        },
      };

      await createSupplier(payload);
      notify?.(`New supplier "${createForm.name}" registered successfully.`, 'success');
      setCreateModalOpen(false);
      setCreateForm({
        name: '',
        verificationStatus: 'VERIFIED',
        dataSourceType: 'VERIFIED_LIVE',
        serviceAreas: ['DELHI_NCR'],
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
      });
      await fetchSuppliers();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to create supplier.', 'error');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Toggle Service Area
  const toggleArea = (area, formType = 'edit') => {
    if (formType === 'edit') {
      setEditForm((prev) => {
        const exists = prev.serviceAreas.includes(area);
        const next = exists
          ? prev.serviceAreas.filter((a) => a !== area)
          : [...prev.serviceAreas, area];
        return { ...prev, serviceAreas: next.length > 0 ? next : [area] };
      });
    } else {
      setCreateForm((prev) => {
        const exists = prev.serviceAreas.includes(area);
        const next = exists
          ? prev.serviceAreas.filter((a) => a !== area)
          : [...prev.serviceAreas, area];
        return { ...prev, serviceAreas: next.length > 0 ? next : [area] };
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6" data-testid="admin-suppliers-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Store className="h-6 w-6 text-teal-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Supplier Verification & Provenance</h1>
            <Badge variant="outline">Catalogue Oversight</Badge>
            <Badge variant={isAdmin ? 'neutral' : 'warning'}>
              {isAdmin ? 'ADMIN MODERATOR' : 'REVIEWER READ-ONLY'}
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Audit distributor verification credentials, data provenance, service coverage, and lifecycle statuses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSuppliers} disabled={loading}>
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              data-testid="add-supplier-btn"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Register Supplier
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-midnight-card border border-midnight-border text-[11px] text-midnight-muted">
              <Lock className="h-3 w-3 text-amber-400" />
              <span>Read-only inspection</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-navigation Links ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/suppliers')}
          className="px-3 py-1.5 rounded-lg bg-midnight-surface border border-midnight-border text-white font-medium"
        >
          Suppliers
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/offers')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Catalogue Offers
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/pools')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Pools & Reconciliation
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/audit')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Audit Logs
        </button>
      </div>

      {/* ── Reviewer Banner ── */}
      {isReviewer && (
        <Alert variant="info" className="py-2.5">
          <Eye className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">Reviewer Mode Active</AlertTitle>
          <AlertDescription className="text-xs">
            Reviewers can audit supplier provenance and credentials, but cannot alter verification badges, active states, or create new suppliers.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Supplier Query Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchSuppliers} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Search & Filter Controls ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          {/* Search Input */}
          <div className="sm:col-span-2">
            <label className="text-midnight-muted block mb-1 font-medium">Search Supplier Name:</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-midnight-muted" />
              <input
                type="text"
                className="w-full rounded-lg bg-midnight-surface border border-midnight-border pl-8 pr-3 py-1.5 text-white text-xs focus:border-teal-400 focus:outline-none"
                placeholder="Search by company or distributor name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* Service Area Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Service Area:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedArea}
              onChange={(e) => {
                setSelectedArea(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Service Areas</option>
              {AVAILABLE_SERVICE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Verification Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Verification Status:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedVerification}
              onChange={(e) => {
                setSelectedVerification(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Verifications</option>
              {VERIFICATION_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Active Status Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Active Status:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedActive}
              onChange={(e) => {
                setSelectedActive(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All (Active & Inactive)</option>
              {ACTIVE_STATUSES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Provenance Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Data Provenance:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedDataSource}
              onChange={(e) => {
                setSelectedDataSource(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Sources</option>
              {DATA_SOURCE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Suppliers Table ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier / Company</TableHead>
              <TableHead>Service Areas</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Active State</TableHead>
              <TableHead>Data Provenance</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-midnight-muted text-xs">
                  No suppliers found matching the specified filters.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((sup) => (
                <TableRow key={sup._id} data-testid={`supplier-row-${sup._id}`}>
                  {/* Name & Owner ID */}
                  <TableCell className="font-medium text-white">
                    <div className="font-semibold text-sm">{sup.name}</div>
                    {sup.ownerUserId && (
                      <div className="text-[10px] text-midnight-muted flex items-center gap-1 mt-0.5">
                        <User className="h-2.5 w-2.5 inline" />
                        <span>Owner: {String(sup.ownerUserId)}</span>
                      </div>
                    )}
                  </TableCell>

                  {/* Service Areas */}
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap max-w-xs">
                      {Array.isArray(sup.serviceAreas) && sup.serviceAreas.length > 0 ? (
                        sup.serviceAreas.map((area) => (
                          <span
                            key={area}
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-midnight-surface border border-midnight-border text-slate-300"
                          >
                            {area}
                          </span>
                        ))
                      ) : (
                        <span className="text-midnight-muted text-xs">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Verification Status */}
                  <TableCell>
                    <Badge
                      variant={
                        sup.verificationStatus === 'VERIFIED'
                          ? 'success'
                          : sup.verificationStatus === 'UNDER_REVIEW'
                          ? 'warning'
                          : 'outline'
                      }
                    >
                      {sup.verificationStatus || 'UNVERIFIED'}
                    </Badge>
                  </TableCell>

                  {/* Active Status */}
                  <TableCell>
                    <Badge
                      variant={
                        sup.activeStatus === 'ACTIVE'
                          ? 'neutral'
                          : sup.activeStatus === 'SUSPENDED'
                          ? 'error'
                          : 'outline'
                      }
                    >
                      {sup.activeStatus || 'ACTIVE'}
                    </Badge>
                  </TableCell>

                  {/* Data Provenance */}
                  <TableCell>
                    <ProvenanceBadge type={sup.dataSourceType} />
                  </TableCell>

                  {/* Contact Info */}
                  <TableCell className="text-xs text-midnight-muted">
                    <div className="space-y-0.5">
                      {sup.contactReference?.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{sup.contactReference.phone}</span>
                        </div>
                      )}
                      {sup.contactReference?.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span>{sup.contactReference.email}</span>
                        </div>
                      )}
                      {!sup.contactReference?.phone && !sup.contactReference?.email && (
                        <span>—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(sup)}
                        className="text-xs h-7 px-2.5"
                        data-testid={`moderate-supplier-${sup._id}`}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Moderate
                      </Button>
                    ) : (
                      <span className="text-[11px] text-midnight-muted">Read-Only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* ── Pagination Footer ── */}
        <div className="flex items-center justify-between p-3 border-t border-midnight-border text-xs text-midnight-muted">
          <span>
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages || 1}</strong> (Total {pagination.totalCount} suppliers)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="h-7 px-2"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Modal: Moderate / Edit Supplier (ADMIN ONLY) ── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-teal-400" />
              Moderate Supplier: {editingSupplier?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Update verification status, operational active state, data provenance, and coverage areas via PATCH /api/admin/suppliers/:id.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Supplier Company Name *</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g. Haryana Grains Wholesale Depot"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Verification Status</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.verificationStatus}
                  onChange={(e) => setEditForm({ ...editForm, verificationStatus: e.target.value })}
                >
                  {VERIFICATION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Active Status</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.activeStatus}
                  onChange={(e) => setEditForm({ ...editForm, activeStatus: e.target.value })}
                >
                  {ACTIVE_STATUSES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Data Provenance</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.dataSourceType}
                  onChange={(e) => setEditForm({ ...editForm, dataSourceType: e.target.value })}
                >
                  {DATA_SOURCE_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Service Areas Picker */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold">Serviceable Delivery Areas *</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_SERVICE_AREAS.map((area) => {
                  const selected = editForm.serviceAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area, 'edit')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                        selected
                          ? 'bg-teal-500 text-midnight-bg font-bold'
                          : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {area} {selected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contact Reference Sub-doc */}
            <div className="space-y-3 pt-2 border-t border-midnight-border">
              <div className="font-semibold text-slate-300">Contact Reference & Tax Identifiers</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-midnight-muted">Contact Person:</label>
                  <Input
                    value={editForm.contactPerson}
                    onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-midnight-muted">Phone Number:</label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="e.g. +91 98123 45678"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-midnight-muted">Email Address:</label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="e.g. sales@haryanagrains.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-midnight-muted">GST Number:</label>
                  <Input
                    value={editForm.gstNumber}
                    onChange={(e) => setEditForm({ ...editForm, gstNumber: e.target.value })}
                    placeholder="e.g. 06AAAAA0000A1Z5"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-midnight-muted">Warehouse / Depot Address:</label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="e.g. Plot 45, Industrial Area Phase 2, Panipat, Haryana"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={submittingEdit} type="submit">
                {submittingEdit ? 'Saving...' : 'Save Supplier Moderation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Register New Supplier (ADMIN ONLY) ── */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-teal-400" />
              Register New Catalogue Supplier
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Add a new wholesale distributor to the platform catalogue via POST /api/admin/suppliers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCreate} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Supplier Company Name *</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Apex FMCG Wholesalers Ltd"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Initial Verification Status</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={createForm.verificationStatus}
                  onChange={(e) => setCreateForm({ ...createForm, verificationStatus: e.target.value })}
                >
                  {VERIFICATION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Data Provenance</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={createForm.dataSourceType}
                  onChange={(e) => setCreateForm({ ...createForm, dataSourceType: e.target.value })}
                >
                  {DATA_SOURCE_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Service Areas Picker */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold">Service Areas *</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_SERVICE_AREAS.map((area) => {
                  const selected = createForm.serviceAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area, 'create')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                        selected
                          ? 'bg-teal-500 text-midnight-bg font-bold'
                          : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {area} {selected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3 pt-2 border-t border-midnight-border">
              <div className="font-semibold text-slate-300">Contact Reference (Optional)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-midnight-muted">Contact Person:</label>
                  <Input
                    value={createForm.contactPerson}
                    onChange={(e) => setCreateForm({ ...createForm, contactPerson: e.target.value })}
                    placeholder="e.g. Sunil Grover"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-midnight-muted">Phone Number:</label>
                  <Input
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-midnight-muted">Email Address:</label>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="e.g. orders@apexfmcg.com"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={submittingCreate} type="submit">
                {submittingCreate ? 'Registering...' : 'Create Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminSuppliersPage;
