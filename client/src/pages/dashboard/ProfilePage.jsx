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
 *      * Wholesaler identity, registered contact email, and active status display
 *      * Informational status regarding backend API dependency (/api/suppliers/me)
 *      * Fast navigation to Supplier Portal (/supplier-portal)
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
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { getMyShop, updateMyShop } from '@/api/shop.api';

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

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(!isSupplier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Original snapshot for cancel rollback
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

  // Working form state
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
  const loadProfile = useCallback(async () => {
    if (isSupplier) {
      setLoading(false);
      return;
    }

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
      // Fallback to AuthContext shop if API fails
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
  }, [isSupplier, extractShopFormData, shop, setShop]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field-level error on edit
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  // Client-side form validation
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

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return; // Guard against duplicate submissions

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

  // Cancel edit mode and restore pristine data
  const handleCancel = () => {
    setFormData(originalData);
    setFieldErrors({});
    setError(null);
    setIsEditing(false);
  };

  // Resolved business type display label
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
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            {isSupplier
              ? 'Wholesaler distributor business identity, catalogue credentials, and platform verification'
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

      {/* ── Role: SUPPLIER Interface ── */}
      {isSupplier ? (
        <div className="space-y-6" data-testid="supplier-profile-view">
          {/* Supplier Identity Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Building className="h-4 w-4 text-midnight-emerald" />
              Wholesaler Business Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Company / Trading Name
                </span>
                <p className="font-bold text-white text-base mt-0.5">{user?.name || 'Wholesale Supplier'}</p>
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
                <p className="font-mono text-slate-200 mt-0.5">{user?.email || 'N/A'}</p>
              </div>

              <div>
                <span className="text-xs font-semibold text-midnight-muted uppercase tracking-wider">
                  Access Level
                </span>
                <p className="font-medium text-teal-300 mt-0.5">Wholesaler Distributor (SUPPLIER)</p>
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
              not supported by the backend architecture.
            </p>
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={() => navigate('/supplier-portal')}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Go to Supplier Portal
              </Button>
            </div>
          </div>
        </div>
      ) : loading ? (
        /* ── Loading Skeleton ── */
        <div className="space-y-4" data-testid="profile-loading-skeleton">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : isEditing ? (
        /* ── Role: SHOP_OWNER Edit Mode Form ── */
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
        /* ── Role: SHOP_OWNER View Mode ── */
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
