import {
  AirplaneIcon, ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowsDownUpIcon, ArrowUpIcon, BackspaceIcon,
  BarbellIcon, BasketIcon, BookOpenIcon, BriefcaseIcon, CalendarBlankIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon,
  CaretUpIcon, CarIcon, ChartBarIcon, ChartPieSliceIcon, ChatCircleDotsIcon, CheckIcon, CircleIcon, ClockIcon,
  CloudArrowUpIcon, CoffeeIcon, CommandIcon, CopyIcon, CreditCardIcon, DesktopIcon, DotsSixVerticalIcon, DotsThreeIcon,
  DotsThreeVerticalIcon, DownloadSimpleIcon, EnvelopeIcon, ForkKnifeIcon, FunnelIcon, GearIcon, GiftIcon,
  GraduationCapIcon, HeartbeatIcon, HeartIcon, HouseIcon, InfoIcon, ListBulletsIcon, LockIcon, MagnifyingGlassIcon,
  MoneyIcon, MoonIcon, PencilSimpleIcon, PlusIcon, ReceiptIcon, ShieldCheckIcon, ShoppingCartIcon, SignOutIcon,
  SlidersHorizontalIcon, SmileyIcon, SparkleIcon, SquaresFourIcon, SunIcon, TableIcon, TagIcon, TrashIcon,
  TrendDownIcon, TrendUpIcon, UploadSimpleIcon, UserIcon, UsersIcon, WalletIcon, WarningCircleIcon, XIcon,
  type Icon as PhosphorIcon, type IconWeight,
} from "@phosphor-icons/react";

/**
 * The app's only icon set (Phosphor). Names stay in the Ionicons vocabulary pennywise-mobile speaks, because
 * category icons are persisted data: a category row stores `icon: "fast-food-outline"`. Unknown names fall
 * back to the tag icon rather than rendering nothing.
 */
const MAP = {
  // Actions and chrome
  "briefcase-outline": BriefcaseIcon,
  "heart-outline": HeartIcon,
  "people-outline": UsersIcon,
  "school-outline": GraduationCapIcon,
  "ellipsis-vertical": DotsThreeVerticalIcon,
  "reorder-handle": DotsSixVerticalIcon,
  add: PlusIcon,
  "add-circle-outline": PlusIcon,
  "alert-circle-outline": WarningCircleIcon,
  "arrow-up": ArrowUpIcon,
  "arrow-down": ArrowDownIcon,
  "arrow-back": ArrowLeftIcon,
  "swap-vertical": ArrowsDownUpIcon,
  "backspace-outline": BackspaceIcon,
  "book-outline": BookOpenIcon,
  "calendar-outline": CalendarBlankIcon,
  "chatbubble-ellipses-outline": ChatCircleDotsIcon,
  checkmark: CheckIcon,
  "chevron-back": CaretLeftIcon,
  "chevron-down": CaretDownIcon,
  "chevron-up": CaretUpIcon,
  "chevron-forward": CaretRightIcon,
  close: XIcon,
  "copy-outline": CopyIcon,
  "create-outline": PencilSimpleIcon,
  "download-outline": DownloadSimpleIcon,
  "cloud-upload-outline": UploadSimpleIcon,
  "cloud-outline": CloudArrowUpIcon,
  "ellipsis-horizontal": DotsThreeIcon,
  happy: SmileyIcon,
  "lock-closed": LockIcon,
  "lock-closed-outline": LockIcon,
  "log-out-outline": SignOutIcon,
  "mail-outline": EnvelopeIcon,
  pencil: PencilSimpleIcon,
  search: MagnifyingGlassIcon,
  "settings-outline": SlidersHorizontalIcon,
  "shield-checkmark": ShieldCheckIcon,
  "sparkles-outline": SparkleIcon,
  "time-outline": ClockIcon,
  "trash-outline": TrashIcon,
  "trending-up": TrendUpIcon,
  "trending-down": TrendDownIcon,
  refresh: ArrowCounterClockwiseIcon,
  filter: FunnelIcon,
  list: ListBulletsIcon,
  table: TableIcon,
  info: InfoIcon,
  gear: GearIcon,
  command: CommandIcon,
  moon: MoonIcon,
  sun: SunIcon,
  desktop: DesktopIcon,

  // Navigation
  home: HouseIcon,
  "home-outline": HouseIcon,
  receipt: ReceiptIcon,
  "receipt-outline": ReceiptIcon,
  "stats-chart": ChartPieSliceIcon,
  "stats-chart-outline": ChartPieSliceIcon,
  "pie-chart-outline": ChartPieSliceIcon,
  "bar-chart-outline": ChartBarIcon,
  grid: SquaresFourIcon,
  "grid-outline": SquaresFourIcon,
  person: UserIcon,
  "person-outline": UserIcon,

  // Category vocabulary (persisted values)
  "pricetag-outline": TagIcon,
  "pricetags-outline": TagIcon,
  "fast-food-outline": ForkKnifeIcon,
  "basket-outline": BasketIcon,
  "car-outline": CarIcon,
  "cart-outline": ShoppingCartIcon,
  "cafe-outline": CoffeeIcon,
  "airplane-outline": AirplaneIcon,
  "fitness-outline": BarbellIcon,
  "medical-outline": HeartbeatIcon,
  "gift-outline": GiftIcon,
  "cash-outline": MoneyIcon,
  "card-outline": CreditCardIcon,
  "wallet-outline": WalletIcon,
  ellipse: CircleIcon,
  "ellipse-outline": CircleIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof MAP;

/** Names offered by the category icon picker, in display order (same as mobile). */
export const CATEGORY_ICON_NAMES = [
  "pricetag-outline", "fast-food-outline", "basket-outline", "car-outline", "home-outline", "cart-outline",
  "cafe-outline", "airplane-outline", "fitness-outline", "medical-outline", "gift-outline", "cash-outline",
  "card-outline", "wallet-outline",
] as const satisfies readonly IconName[];

/** Category identity palette from mobile's tokens.category; also the category editor's swatches. */
export const CATEGORY_COLORS = ["#FFB35C", "#9BD881", "#7FD4E8", "#B49CFF", "#7EA6FF", "#FF9ECF", "#6FE5C9", "#A8B0BC"];

type Props = {
  name: IconName | (string & {});
  size?: number;
  weight?: IconWeight;
  className?: string;
  /** Decorative by default; pass a label when the icon carries meaning on its own. */
  label?: string;
};

export function Icon({ name, size = 20, weight = "regular", className, label }: Props) {
  const Glyph = (MAP as Record<string, PhosphorIcon>)[name] ?? TagIcon;
  return (
    <Glyph
      size={size}
      weight={weight}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

/** Icon on a tinted tile in the category's own color (persisted hex), as on mobile. */
export function CategoryIcon({ icon, color, size = 40 }: { icon?: string | null; color?: string | null; size?: number }) {
  const tint = color || "#A8B0BC";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: `${tint}24`, color: tint }}
    >
      <Icon name={icon || "pricetag-outline"} size={Math.round(size * 0.5)} weight="duotone" />
    </span>
  );
}
