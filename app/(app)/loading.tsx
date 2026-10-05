import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="w-full min-h-[80vh] grid place-items-center">
      <Spinner className="size-10" />
    </div>
  );
}
