import { Skeleton } from "@/components/ui/skeleton";

export default function AttributesLoading() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="mt-6 h-64 rounded-lg" />
    </div>
  );
}
