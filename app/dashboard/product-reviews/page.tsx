import { Star } from "lucide-react";

export default function ProductReviewsPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold">Product Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage feedback submitted for your products.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
        <Star className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 font-medium">Product reviews are ready for setup</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Review collection, moderation, and publishing controls will be added here as the
          product tools are built out.
        </p>
      </div>
    </div>
  );
}
