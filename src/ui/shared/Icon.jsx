import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Cog,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  Pause,
  Play,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SkipBack,
  SkipForward,
  Trash2,
  UsersRound,
  X,
} from "lucide";
import { h } from "preact";

const icons = {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Cog,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  Pause,
  Play,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SkipBack,
  SkipForward,
  Trash2,
  UsersRound,
  X,
};

export function Icon({ name, class: className = "", ...props }) {
  const key = name.replace(/(^|-)(\w)/g, (_, _dash, letter) =>
    letter.toUpperCase(),
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`lucide lucide-${name} ${className}`.trim()}
      data-lucide={name}
      aria-hidden="true"
      {...props}
    >
      {(icons[key] || []).map(([tag, attrs], index) =>
        h(tag, { ...attrs, key: index }),
      )}
    </svg>
  );
}
