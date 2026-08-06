const colorMap: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

export function Badge({ color = 'gray', children }: { color?: keyof typeof colorMap; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color]}`}>
      {children}
    </span>
  );
}

export function statusColor(status: string): keyof typeof colorMap {
  switch (status) {
    case 'PAID':
    case 'CONFIRMED':
    case 'APPROVED':
      return 'green';
    case 'CANCELLED':
      return 'red';
    case 'PARTIALLY_PAID':
    case 'DRAFT':
      return 'yellow';
    default:
      return 'gray';
  }
}
