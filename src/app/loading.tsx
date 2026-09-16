import { PageSkeleton } from "@/components/shared/PageSkeleton";

export default function Loading() {
  return <PageSkeleton stats={6} cards={2} />;
}
