import mongoose from "mongoose";

/**
 * Task SAH-05: Product Model
 *
 * Represents the normalized master catalogue product definition.
 * All supplier offers link to a canonical Product record for accurate matching.
 *
 * Follows mongodb-schema-design and mongoose-optimization:
 * - Text search index on { canonicalName: "text", synonyms: "text" }.
 * - Compound index on category and critical specifications for deterministic filtering.
 * - Normalized base units and pack sizes to ensure cross-supplier comparability.
 */

const productSpecificationSchema = new mongoose.Schema(
  {
    material: {
      type: String,
      required: [true, "Material specification is required."],
      trim: true,
    },
    capacityOrSize: {
      type: String,
      required: [true, "Capacity or size specification is required."],
      trim: true,
    },
    foodSafe: {
      type: Boolean,
      default: false,
    },
    certifications: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    grade: {
      type: String,
      trim: true,
      default: "STANDARD",
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    canonicalName: {
      type: String,
      required: [true, "Product canonical name is required."],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, "Product category is required."],
      trim: true,
      uppercase: true,
      index: true,
    },
    baseUnit: {
      type: String,
      required: [true, "Base unit (e.g., BOX, BAG, CARTON, UNIT) is required."],
      uppercase: true,
      trim: true,
    },
    packSizeDescription: {
      type: String,
      required: [true, "Pack size description (e.g., '1000 cups / box') is required."],
      trim: true,
    },
    unitsPerPack: {
      type: Number,
      required: true,
      min: [1, "Units per pack must be at least 1."],
      default: 1,
    },
    specifications: {
      type: productSpecificationSchema,
      required: [true, "Product specifications are required."],
    },
    synonyms: [
      {
        type: String,
        trim: true,
      },
    ],
    brandConstraint: {
      type: String,
      trim: true,
      default: null,
    },
    brand: {
      type: String,
      trim: true,
      default: "GENERIC",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Compound index for attribute-based candidate matching (SAH-06)
productSchema.index({
  category: 1,
  "specifications.material": 1,
  "specifications.capacityOrSize": 1,
});

// Full-text index for flexible keyword catalogue search (GET /api/products/search)
productSchema.index({
  canonicalName: "text",
  synonyms: "text",
});

export const Product = mongoose.model("Product", productSchema);
export default Product;

