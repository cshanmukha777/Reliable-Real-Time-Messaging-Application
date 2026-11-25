import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Image,
  Inbox,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '../design/theme';

const glyphs = {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Image,
  Inbox,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
};
export type IconName = keyof typeof glyphs;

export function Icon({
  name,
  color,
  size = 18,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const Glyph = glyphs[name];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Glyph size={size} strokeWidth={1.65} color={color ?? colors.secondary} />
    </View>
  );
}
