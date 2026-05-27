import { Loader2, AlertCircle, Inbox } from "lucide-react";

export function LoadingState({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-surface-500">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-400">
      <AlertCircle className="w-8 h-8" />
      <span className="text-sm text-center max-w-xs">{message}</span>
    </div>
  );
}

export function EmptyState({
  title = "Nada por aqui",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Inbox className="w-10 h-10 text-surface-600" />
      <div className="text-center">
        <p className="font-medium text-surface-300">{title}</p>
        {description && <p className="text-sm text-surface-500 mt-1">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
