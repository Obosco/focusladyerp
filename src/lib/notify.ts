import { toast } from "sonner";

export function timeStampLabel(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function notifyUpdate(message: string) {
  return toast.success(`${message} • ${timeStampLabel()}`);
}
