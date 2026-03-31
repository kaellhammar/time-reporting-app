type Status = 'draft' | 'submitted' | 'approved';

const styles: Record<Status, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
};

const labels: Record<Status, string> = {
  draft: 'Utkast',
  submitted: 'Inskickad',
  approved: 'Godkänd',
};

export default function Badge({ status }: { status: string }) {
  const s = (status as Status) in styles ? (status as Status) : 'draft';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[s]}`}>
      {labels[s]}
    </span>
  );
}
