import mongoose from "mongoose";

const deliveryAddressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: "" },
    city: { type: String, required: [true, "City is required"], trim: true },
    state: { type: String, required: [true, "State is required"], trim: true },
    postalCode: { type: String, required: [true, "Postal code is required"], trim: true },
    country: { type: String, default: "IN", trim: true },
  },
  { _id: false }
);

const contactDetailsSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true, default: "" },
    whatsapp: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const shopSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Shop name is required"],
      trim: true,
      maxlength: [150, "Shop name cannot exceed 150 characters"],
    },
    businessType: {
      type: String,
      enum: ["KIRANA_RETAIL", "CAFE", "BAKERY", "RESTAURANT", "SUPERMARKET", "OTHER"],
      default: "KIRANA_RETAIL",
      required: true,
    },
    deliveryArea: {
      type: String,
      required: [true, "Delivery area is required"],
      trim: true,
      index: true,
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      required: true,
    },
    contactDetails: {
      type: contactDetailsSchema,
      default: () => ({}),
    },
    preferredCurrency: {
      type: String,
      default: "INR",
      enum: ["INR", "USD"],
    },
  },
  { timestamps: true }
);

export const Shop = mongoose.model("Shop", shopSchema);
export default Shop;

