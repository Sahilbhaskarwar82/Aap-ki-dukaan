/**
 * CoBuy AI — Business Profile & Settings Page (HIM-06 / PRK-04)
 *
 * Route: /profile
 *
 * Supports both SHOP_OWNER and SUPPLIER roles:
 *  - SHOP_OWNER:
 *      * Loads authenticated shop profile via verified PRK-04 GET /api/shops/me
 *      * View mode / Edit mode toggle
 *      * Comprehensive client-side validation & field-level error messages
 *      * Submits valid payload via PATCH /api/shops/me conforming to Shop.model.js
 *      * In-flight submission guards to prevent duplicate saves
 *      * Cancel restores original form values
 *      * Updates AuthContext shop state & invokes refreshUser()
 *  - SUPPLIER:
 *      * Loads authenticated wholesale profile via GET /api/suppliers/me
 *      * View mode with wholesaler identity, registered credentials, and verification status
 *      * Full Edit mode with PATCH /api/suppliers/me for company name, contact person, phone, whatsapp, gstin, address, and service areas
 *      * In-flight guards, field-level validation, and instant profile refresh
 *      * Direct link to Supplier Portal (/supplier-portal)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Edit3,
  X,
  Building,
  ExternalLink,
  Phone,
  Mail,
  FileText,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { getMyShop, updateMyShop } from '@/api/shop.api';
import { getMySupplierProfile, updateMySupplierProfile } from '@/api/suppliers.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';

export const BUSINESS_TYPES = [
  { value: 'KIRANA_RETAIL', label: 'Kirana & Grocery Retail' },
  { value: 'CAFE', label: 'Café & Beverage Shop' },
  { value: 'BAKERY', label: 'Bakery & Confectionery' },
  { value: 'RESTAURANT', label: 'Restaurant & Cloud Kitchen' },
  { value: 'SUPERMARKET', label: 'Supermarket / Mini-Mart' },
  { value: 'OTHER', label: 'Other Commercial Business' },
];

export const DELIVERY_AREAS = [
  'LUCKNOW',
  'KANPUR',
  'VARANASI',
  'AGRA',
  'NOIDA',
  'GHAZIABAD',
  'DELHI_NCR',
  'PRAYAGRAJ',
  'MEERUT',
  'BAREILLY',
  'MUMBAI_METRO',
  'BANGALORE',
  'HYDERABAD',
  'PUNE',
  'CHENNAI',
  'AHMEDABAD',
  'CHANDIGARH',
  'ALL_INDIA',
];

const CURRENCIES = [
  { value: 'INR', label: 'INR (₹ - Indian Rupee)' },
  { value: 'USD', label: 'USD ($ - US Dollar)' },
];

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, shop, setShop, refreshUser } = useAuth();
  const { notify } = useNotifications();

  const isSupplier = user?.role === 'SUPPLIER';

  // Common UI State
  const [loading, setLoading] = useState(!isSupplier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // ── Shop Owner State ──
  const [isEditing, setIsEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [originalData, setOriginalData] = useState({
    name: '',
    businessType: 'KIRANA_RETAIL',
    deliveryArea: 'LUCKNOW',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    phone: '',
    whatsapp: '',
    gstin: '',
    preferredCurrency: 'INR',
  });
  const [formData, setFormData] = useState({
    name: '',
    businessType: 'KIRANA_RETAIL',
    deliveryArea: 'LUCKNOW',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    phone: '',
    whatsapp: '',
    gstin: '',
    preferredCurrency: 'INR',
  });

  // ── Supplier State ──
  const [isSupplierEditing, setIsSupplierEditing] = useState(false);
  const [supplierData, setSupplierData] = useState(null);
  const [supplierFieldErrors, setSupplierFieldErrors] = useState({});
  const [originalSupplierData, setOriginalSupplierData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    address: '',
    gstin: '',
    serviceAreas: ['ALL_INDIA'],
  });
  const [supplierFormData, setSupplierFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    address: '',
    gstin: '',
    serviceAreas: ['ALL_INDIA'],
  });

  const extractShopFormData = useCallback((shopDoc) => {
    if (!shopDoc) return null;
    const addr = shopDoc.deliveryAddress || {};
    const contact = shopDoc.contactDetails || {};

    return {
      name: shopDoc.name || '',
      businessType: shopDoc.businessType || 'KIRANA_RETAIL',
      deliveryArea: shopDoc.deliveryArea || (typeof shopDoc.address === 'string' ? shopDoc.address : 'LUCKNOW'),
      street: addr.street || (typeof shopDoc.address === 'string' ? shopDoc.address : ''),
      city: addr.city || 'Lucknow',
      state: addr.state || 'Uttar Pradesh',
      postalCode: addr.postalCode || '226001',
      country: addr.country || 'IN',
      phone: contact.phone || shopDoc.contactPhone || '',
      whatsapp: contact.whatsapp || '',
      gstin: contact.gstin || shopDoc.gstin || '',
      preferredCurrency: shopDoc.preferredCurrency || 'INR',
    };
  }, []);

  // Fetch shop profile on mount for SHOP_OWNER
  const loadShopProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyShop();
      if (data) {
        const extracted = extractShopFormData(data);
        setFormData(extracted);
        setOriginalData(extracted);
        if (setShop) setShop(data);
      } else if (shop) {
        const extracted = extractShopFormData(shop);
        setFormData(extracted);
        setOriginalData(extracted);
      }
    } catch (err) {
      if (shop) {
        const extracted = extractShopFormData(shop);
        setFormData(extracted);
        setOriginalData(extracted);
      } else {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load shop profile.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [extractShopFormData, shop, setShop]);

  // Fetch supplier profile on mount for SUPPLIER
  const loadSupplierProfile = useCallback(async () => {
    setError(null);
    try {
      const data = await getMySupplierProfile();
      if (data) {
        setSupplierData(data);
        const contact = data.contactReference || {};
        const extracted = {
          name: data.name || user?.name || 'Wholesale Supplier',
          contactPerson: contact.contactPerson || '',
          phone: contact.phone || '',
          whatsapp: contact.whatsapp || '',
          address: contact.address || '',
          gstin: contact.gstin || '',
          serviceAreas: Array.isArray(data.serviceAreas) && data.serviceAreas.length > 0
            ? data.serviceAreas
            : ['ALL_INDIA'],
        };
        setSupplierFormData(extracted);
        setOriginalSupplierData(extracted);
      } else {
        const fallback = {
          name: user?.name || 'Wholesale Supplier',
          contactPerson: '',
          phone: '',
          whatsapp: '',
          address: '',
          gstin: '',
          serviceAreas: ['ALL_INDIA'],
        };
        setSupplierFormData(fallback);
        setOriginalSupplierData(fallback);
      }
    } catch (err) {
      const fallback = {
        name: user?.name || 'Wholesale Supplier',
        contactPerson: user?.name || '',
        phone: '',
        whatsapp: '',
        address: '',
        gstin: '',
        serviceAreas: ['ALL_INDIA'],
      };
      setSupplierFormData(fallback);
      setOriginalSupplierData(fallback);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isSupplier) {
      loadSupplierProfile();
    } else {
      loadShopProfile();
    }
  }, [isSupplier, loadShopProfile, loadSupplierProfile]);

  // Handle shop input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  // Handle supplier input changes
  const handleSupplierChange = (e) => {
    const { name, value } = e.target;
    setSupplierFormData((prev) => ({ ...prev, [name]: value }));
    if (supplierFieldErrors[name]) {
      setSupplierFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  // Toggle supplier service area
  const handleToggleServiceArea = (area) => {
    setSupplierFormData((prev) => {
      const current = prev.serviceAreas || [];
      const next = current.includes(area)
        ? current.filter((a) => a !== area)
        : [...current, area];
      return { ...prev, serviceAreas: next };
    });
    if (supplierFieldErrors.serviceAreas) {
      setSupplierFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated.serviceAreas;
        return updated;
      });
    }
  };

  // Client-side form validation for Shop
  const validateForm = () => {
    const errors = {};

    if (!formData.name?.trim()) {
      errors.name = 'Shop / Business name is required.';
    } else if (formData.name.trim().length > 150) {
      errors.name = 'Shop name cannot exceed 150 characters.';
    }

    if (!formData.city?.trim()) {
      errors.city = 'City is required for delivery logistics.';
    }

    if (!formData.state?.trim()) {
      errors.state = 'State is required.';
    }

    if (!formData.postalCode?.trim()) {
      errors.postalCode = 'Postal PIN code is required.';
    } else if (!/^\d{6}$/.test(formData.postalCode.trim())) {
      errors.postalCode = 'Please enter a valid 6-digit postal PIN code.';
    }

    if (!formData.phone?.trim()) {
      errors.phone = 'Contact phone number is required.';
    } else if (!/^[+]?[\d\s-]{10,15}$/.test(formData.phone.trim())) {
      errors.phone = 'Please enter a valid contact phone number (at least 10 digits).';
    }

    if (formData.gstin?.trim()) {
      const gstinClean = formData.gstin.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinClean)) {
        errors.gstin = 'Invalid GSTIN format (e.g. 09AAAAA0000A1Z5).';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Shop submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!validateForm()) {
      setError('Please resolve validation errors before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      const payload = {
        name: formData.name.trim(),
        businessType: formData.businessType,
        deliveryArea: formData.deliveryArea,
        deliveryAddress: {
          street: formData.street.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          postalCode: formData.postalCode.trim(),
          country: formData.country || 'IN',
        },
        contactDetails: {
          phone: formData.phone.trim(),
          whatsapp: formData.whatsapp?.trim() || undefined,
          gstin: formData.gstin?.trim() ? formData.gstin.trim().toUpperCase() : undefined,
        },
        preferredCurrency: formData.preferredCurrency || 'INR',
      };

      const updated = await updateMyShop(payload);
      const newSnapshot = extractShopFormData(updated) || formData;

      setFormData(newSnapshot);
      setOriginalData(newSnapshot);
      if (setShop && updated) {
        setShop(updated);
      }
      if (refreshUser) {
        await refreshUser();
      }

      setSuccessMessage('Business profile updated successfully.');
      notify?.('Shop profile updated successfully!', 'success');
      setIsEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save shop profile.';
      setError(msg);
      notify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Supplier submission
  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const errors = {};
    if (!supplierFormData.name?.trim()) {
      errors.name = 'Company / Business name is required.';
    } else if (supplierFormData.name.trim().length > 160) {
      errors.name = 'Company name cannot exceed 160 characters.';
    }

    if (!supplierFormData.serviceAreas || supplierFormData.serviceAreas.length === 0) {
      errors.serviceAreas = 'At least one serviceable delivery area must be selected.';
    }

    if (supplierFormData.phone?.trim() && !/^[+]?[\d\s-]{10,15}$/.test(supplierFormData.phone.trim())) {
      errors.phone = 'Please enter a valid contact phone number (at least 10 digits).';
    }

    if (supplierFormData.gstin?.trim()) {
      const gstinClean = supplierFormData.gstin.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinClean)) {
        errors.gstin = 'Invalid GSTIN format (e.g. 09AAAAA0000A1Z5).';
      }
    }

    setSupplierFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Please resolve validation errors before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      const payload = {
        name: supplierFormData.name.trim(),
        serviceAreas: supplierFormData.serviceAreas,
        contactReference: {
          contactPerson: supplierFormData.contactPerson?.trim() || '',
          phone: supplierFormData.phone?.trim() || '',
          whatsapp: supplierFormData.whatsapp?.trim() || '',
          address: supplierFormData.address?.trim() || '',
          gstin: supplierFormData.gstin?.trim() ? supplierFormData.gstin.trim().toUpperCase() : '',
        },
      };

      const updated = await updateMySupplierProfile(payload);
      if (updated) {
        setSupplierData(updated);
        const contact = updated.contactReference || {};
        const newSnap = {
          name: updated.name || supplierFormData.name,
          contactPerson: contact.contactPerson || supplierFormData.contactPerson,
          phone: contact.phone || supplierFormData.phone,
          whatsapp: contact.whatsapp || supplierFormData.whatsapp,
          address: contact.address || supplierFormData.address,
          gstin: contact.gstin || supplierFormData.gstin,
          serviceAreas: updated.serviceAreas || supplierFormData.serviceAreas,
        };
        setSupplierFormData(newSnap);
        setOriginalSupplierData(newSnap);
      } else {
        setOriginalSupplierData(supplierFormData);
      }

      if (refreshUser) {
        await refreshUser();
      }

      setSuccessMessage('Wholesaler business profile updated successfully.');
      notify?.('Wholesaler business profile updated successfully!', 'success');
      setIsSupplierEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save supplier profile.';
      setError(msg);
      notify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Cancel edit mode and restore pristine data
  const handleCancel = () => {
    setFormData(originalData);
    setFieldErrors({});
    setError(null);
    setIsEditing(false);
  };

  const handleSupplierCancel = () => {
    if (originalSupplierData) {
      setSupplierFormData(originalSupplierData);
    }
    setSupplierFieldErrors({});
    setError(null);
    setIsSupplierEditing(false);
  };

  const businessTypeLabel = useMemo(() => {
    const found = BUSINESS_TYPES.find((b) => b.value === formData.businessType);
    return found ? found.label : formData.businessType;
  }, [formData.businessType]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6" data-testid="profile-page">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Business Profile & Settings</h1>
            <Badge variant="warning">Wave 3 (HIM-06)</Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            {isSupplier
              ? 'Wholesaler distributor business identity, contact channels, delivery zones, and verification status'
              : 'Manage kirana business identity, verified delivery drop location, and GSTIN trade credentials'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="pool" className="font-mono text-xs">
            Role: {user?.role || 'SHOP_OWNER'}
          </Badge>
          {!isSupplier && !isEditing && !loading && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsEditing(true)}
              data-testid="edit-profile-button"
            >
              <Edit3 className="h-4 w-4 mr-1.5" /> Edit Profile
            </Button>
          )}
          {isSupplier && !isSupplierEditing && !loading && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSupplierEditing(true)}
              data-testid="edit-supplier-profile-button"
            >
              <Edit3 className="h-4 w-4 mr-1.5" /> Edit Profile
            </Button>
          )}
        </div>
      </div>

      {/* ── Feedback Banners ── */}
      {error && (
        <Alert variant="destructive" data-testid="profile-error-alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Profile Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" data-testid="profile-success-alert">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* ── Loading Skeleton ── */}
      {loading ? (
        <div className="space-y-4" data-testid="profile-loading-skeleton">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : isSupplier ? (
        /* ═════════════════════════════════════════════════════════════════════
           ROLE: SUPPLIER INTERFACE
           ═════════════════════════════════════════════════════════════════════ */
        isSupplierEditing ? (
          /* ── SUPPLIER Edit Mode Form ── */
          <form onSubmit={handleSupplierSubmit} className="space-y-6" data-testid="supplier-profile-edit-form" noValidate>
            <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
              <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
                <Building className="h-4 w-4 text-midnight-emerald" />
                Edit Wholesaler Business Identity
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Company / Trading Name <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    name="name"
                    value={supplierFormData.name}
                    onChange={handleSupplierChange}
                    placeholder="e.g. North India EcoPack Wholesalers"
                    required
                  />
                  {supplierFieldErrors.name && (
                    <p className="text-[11px] text-rose-400">{supplierFieldErrors.name}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Primary Contact Person
                  </label>
                  <Input
                    name="contactPerson"
                    value={supplierFormData.contactPerson}
                    onChange={handleSupplierChange}
                    placeholder="e.g. Ramesh Chandra"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Contact Phone (+91)
                  </label>
                  <Input
                    name="phone"
                    value={supplierFormData.phone}
                    onChange={handleSupplierChange}
                    placeholder="9876543210"
                  />
                  {supplierFieldErrors.phone && (
                    <p className="text-[11px] text-rose-400">{supplierFieldErrors.phone}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    WhatsApp Number (Optional)
                  </label>
                  <Input
                    name="whatsapp"
                    value={supplierFormData.whatsapp}
                    onChange={handleSupplierChange}
                    placeholder="9876543210"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Business Address / Warehouse Headquarters
                  </label>
                  <Input
                    name="address"
                    value={supplierFormData.address}
                    onChange={handleSupplierChange}
                    placeholder="e.g. Plot 42, Transport Nagar, Lucknow, UP 226012"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300">
                    GSTIN / Tax Identification Number
                  </label>
                  <Input
                    name="gstin"
                    value={supplierFormData.gstin}
                    onChange={handleSupplierChange}
                    placeholder="09AAAAA0000A1Z5"
                  />
                  {supplierFieldErrors.gstin && (
                    <p className="text-[11px] text-rose-400">{supplierFieldErrors.gstin}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Serviceable Delivery Areas */}
            <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
              <div className="border-b border-midnight-border/70 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-teal-400" />
                  Serviceable Delivery Regions <span className="text-rose-400">*</span>
                </h3>
                <p className="text-xs text-midnight-muted mt-1">
                  Select all geographic areas where your wholesale fleet or delivery partners can fulfill group-buy orders.
                </p>
              </div>

              {supplierFieldErrors.serviceAreas && (
                <p className="text-xs text-rose-400">{supplierFieldErrors.serviceAreas}</p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
                {DELIVERY_AREAS.map((area) => {
                  const isChecked = supplierFormData.serviceAreas?.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => handleToggleServiceArea(area)}
                      className={`text-xs font-medium py-2 px-3 rounded-lg border text-left transition-colors flex items-center justify-between ${
                        isChecked
                          ? 'border-midnight-emerald bg-emerald-950/30 text-emerald-300'
                          : 'border-midnight-border bg-midnight-surface/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span>{area}</span>
                      {isChecked && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Read-Only Account Details */}
            <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-3 shadow-xl">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-400" />
                System-Protected Account Credentials (Read-Only)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-midnight-muted block">Registered Email</span>
                  <span className="font-mono text-slate-200">{user?.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-midnight-muted block">Verification Status</span>
                  <span className="font-semibold text-emerald-400">{supplierData?.verificationStatus || 'VERIFIED'}</span>
                </div>
                <div>
                  <span className="text-midnight-muted block">Account Role</span>
                  <span className="font-semibold text-teal-300">{user?.role || 'SUPPLIER'}</span>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSupplierCancel}
                disabled={saving}
                data-testid="cancel-supplier-profile-button"
              >
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saving}
                data-testid="save-supplier-profile-button"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" /> Save Profile
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          /* ── SUPPLIER View Mode ── */
          <div className="space-y-6" data-testid="supplier-profile-view">
            {/* Supplier Identity Card */}
            <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Building className="h-4 w-4 text-midnight-emerald" />
                  Wholesaler Business Identity
                </h2>
                <Badge variant="success">ACTIVE & REGISTERED</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Company / Trading Name
                  </span>
                  <p className="font-bold text-white text-base mt-0.5" data-testid="supplier-company-name">
                    {supplierData?.name || supplierFormData.name || user?.name || 'North India EcoPack Wholesalers'}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Platform Verification Status
                  </span>
                  <div className="mt-1">
                    <Badge variant="success">ACTIVE & REGISTERED</Badge>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Authorized Contact Email
                  </span>
                  <p className="font-mono text-slate-200 mt-0.5">{user?.email || 'sales@ecopack.in'}</p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Access Level
                  </span>
                  <p className="font-medium text-teal-300 mt-0.5">Wholesaler Distributor (SUPPLIER)</p>
                </div>

                {Boolean(supplierFormData.contactPerson) && (
                  <div>
                    <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                      Primary Contact Person
                    </span>
                    <p className="font-medium text-slate-200 mt-0.5">
                      {supplierFormData.contactPerson}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Contact Phone
                  </span>
                  <p className="font-mono text-slate-200 mt-0.5">
                    {supplierFormData.phone ? `+91 ${supplierFormData.phone}` : 'Not provided'}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    WhatsApp Channel
                  </span>
                  <p className="font-mono text-slate-200 mt-0.5">
                    {supplierFormData.whatsapp ? `+91 ${supplierFormData.whatsapp}` : 'None configured'}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    GSTIN / Tax ID
                  </span>
                  <p className="font-mono text-slate-200 mt-0.5">
                    {supplierFormData.gstin || 'Unregistered / Not provided'}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                    Business Address / Warehouse
                  </span>
                  <p className="text-slate-200 mt-0.5">
                    {supplierFormData.address || 'No address specified'}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider block mb-1.5">
                    Serviceable Delivery Areas
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(supplierFormData.serviceAreas || ['ALL_INDIA']).map((area) => (
                      <Badge key={area} variant="pool" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* Supplier API Notice Card */}
            <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-amber-400" />
                Catalogue & Business Profile Administration
              </h3>
              <p className="text-xs text-midnight-muted leading-relaxed">
                Wholesaler business profiles, verified delivery service areas, and catalogue offer tiers are synchronized directly via
                the dedicated Supplier Portal and platform administrative workflows. Self-serve profile editing via <code>/api/suppliers/me</code> is
                now enabled for updating core contact details, GSTIN, and serviceable regions.
              </p>
              <div className="pt-2">
                <Button variant="primary" size="sm" onClick={() => navigate('/supplier-portal')}>
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Go to Supplier Portal
                </Button>
              </div>
            </div>
          </div>
        )
      ) : isEditing ? (
        /* ═════════════════════════════════════════════════════════════════════
           ROLE: SHOP_OWNER EDIT MODE FORM
           ═════════════════════════════════════════════════════════════════════ */
        <form onSubmit={handleSubmit} className="space-y-6" data-testid="shop-profile-edit-form" noValidate>
          {/* Section 1: Shop & Identity */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Store className="h-4 w-4 text-midnight-emerald" />
              Kirana / Shop Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Shop / Business Name <span className="text-rose-400">*</span>
                </label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Hazratganj Super Store"
                  required
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Business Model Type</label>
                <select
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-sm p-2.5 focus:border-midnight-emerald focus:outline-none"
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Contact Phone (+91) <span className="text-rose-400">*</span>
                </label>
                <Input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="9876543210"
                  required
                />
                {fieldErrors.phone && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.phone}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">WhatsApp Notification Number (Optional)</label>
                <Input
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleChange}
                  placeholder="9876543210"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">GSTIN / Tax Identifier (Optional)</label>
                <Input
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  placeholder="09AAAAA0000A1Z5"
                />
                {fieldErrors.gstin && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.gstin}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Preferred Settlement Currency</label>
                <select
                  name="preferredCurrency"
                  value={formData.preferredCurrency}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-sm p-2.5 focus:border-midnight-emerald focus:outline-none"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Delivery & Logistics Address */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <MapPin className="h-4 w-4 text-teal-400" />
              Delivery Drop Location & Logistics Area
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Street Address / Landmark</label>
                <Input
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  placeholder="Shop No. 12, Main Market Road, Near Clock Tower"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  City <span className="text-rose-400">*</span>
                </label>
                <Input
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="e.g. Lucknow"
                  required
                />
                {fieldErrors.city && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.city}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  State <span className="text-rose-400">*</span>
                </label>
                <Input
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="e.g. Uttar Pradesh"
                  required
                />
                {fieldErrors.state && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.state}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Postal PIN Code <span className="text-rose-400">*</span>
                </label>
                <Input
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleChange}
                  placeholder="226001"
                  required
                />
                {fieldErrors.postalCode && (
                  <p className="text-[11px] text-rose-400">{fieldErrors.postalCode}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Regional Delivery Area</label>
                <select
                  name="deliveryArea"
                  value={formData.deliveryArea}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-sm p-2.5 focus:border-midnight-emerald focus:outline-none"
                >
                  {DELIVERY_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-midnight-muted">
                  Group-buy pool discovery and supplier quotes are filtered strictly by this delivery area.
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              data-testid="cancel-edit-button"
            >
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              data-testid="save-profile-button"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving Changes...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Save Profile
                </>
              )}
            </Button>
          </div>
        </form>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           ROLE: SHOP_OWNER VIEW MODE
           ═════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6" data-testid="shop-profile-view">
          {/* Card 1: Shop Identity & Model */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Store className="h-4 w-4 text-midnight-emerald" />
                Kirana / Shop Identity
              </h2>
              <Badge variant="pool">{businessTypeLabel}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Shop / Business Name
                </span>
                <p className="font-bold text-white text-base mt-0.5" data-testid="profile-shop-name">
                  {formData.name || 'Not provided'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Authorized Owner / Contact
                </span>
                <p className="font-medium text-slate-200 mt-0.5">
                  {user?.name || 'Shop Owner'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Contact Phone
                </span>
                <p className="font-mono text-slate-200 mt-0.5">
                  {formData.phone ? `+91 ${formData.phone}` : 'Not provided'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  WhatsApp Notifications
                </span>
                <p className="font-mono text-slate-200 mt-0.5">
                  {formData.whatsapp ? `+91 ${formData.whatsapp}` : 'None configured'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  GSTIN / Tax Identifier
                </span>
                <p className="font-mono text-slate-200 mt-0.5">
                  {formData.gstin || 'Unregistered / Not provided'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Preferred Currency
                </span>
                <p className="font-mono text-slate-200 mt-0.5">{formData.preferredCurrency}</p>
              </div>
            </div>
          </div>

          {/* Card 2: Delivery & Regional Logistics */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <MapPin className="h-4 w-4 text-teal-400" />
              Delivery Drop Location & Regional Zone
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div className="sm:col-span-2">
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Street Address / Landmark
                </span>
                <p className="text-slate-200 mt-0.5">
                  {formData.street || 'No street address specified'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  City, State & PIN
                </span>
                <p className="text-slate-200 mt-0.5">
                  {formData.city}, {formData.state} - {formData.postalCode}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Regional Delivery Area
                </span>
                <div className="mt-0.5">
                  <Badge variant="success">{formData.deliveryArea}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Account Credentials */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Shield className="h-4 w-4 text-slate-400" />
              Account Credentials
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Registered Email
                </span>
                <p className="font-mono text-slate-200 mt-0.5">{user?.email || 'N/A'}</p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Role
                </span>
                <p className="font-medium text-teal-300 mt-0.5">{user?.role || 'SHOP_OWNER'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
