import React, { useState } from 'react';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { Button } from '../../components/ui/Button';
import { Users, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface StaffAttendance {
  id: string;
  staffName: string;
  role: string;
  status: 'present' | 'absent' | 'half-day' | 'unmarked';
}

const mockStaffData: StaffAttendance[] = [
  { id: '1', staffName: 'Alice Johnson', role: 'Cashier', status: 'present' },
  { id: '2', staffName: 'Bob Smith', role: 'Store Manager', status: 'unmarked' },
  { id: '3', staffName: 'Charlie Brown', role: 'Inventory Clerk', status: 'absent' },
  { id: '4', staffName: 'Diana Prince', role: 'Sales Associate', status: 'half-day' },
];

export const AttendancePage: React.FC = () => {
  const [data, setData] = useState<StaffAttendance[]>(mockStaffData);

  const handleMarkAttendance = (id: string, status: StaffAttendance['status']) => {
    setData((prev) => prev.map((staff) => (staff.id === id ? { ...staff, status } : staff)));
  };

  const columns = [
    { header: 'Staff Name', accessor: 'staffName', sortable: true },
    { header: 'Role', accessor: 'role', sortable: true },
    { 
      header: 'Status', 
      accessor: 'status', 
      sortable: true,
      cell: ({ value }: { value: unknown }) => {
        switch (String(value)) {
          case 'present':
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Present</span>;
          case 'absent':
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400">Absent</span>;
          case 'half-day':
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">Half-Day</span>;
          default:
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">Unmarked</span>;
        }
      }
    },
    { 
      header: 'Actions', 
      accessor: 'actions', 
      cell: ({ row }: { row: StaffAttendance }) => (
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant={row.status === 'present' ? 'primary' : 'secondary'}
            onClick={(e) => { e.stopPropagation(); handleMarkAttendance(row.id, 'present'); }}
            title="Mark Present"
            className={row.status === 'present' ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' : ''}
          >
            <CheckCircle2 className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant={row.status === 'absent' ? 'primary' : 'secondary'}
            onClick={(e) => { e.stopPropagation(); handleMarkAttendance(row.id, 'absent'); }}
            title="Mark Absent"
            className={row.status === 'absent' ? 'bg-rose-600 hover:bg-rose-700 text-white border-transparent' : ''}
          >
            <XCircle className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant={row.status === 'half-day' ? 'primary' : 'secondary'}
            onClick={(e) => { e.stopPropagation(); handleMarkAttendance(row.id, 'half-day'); }}
            title="Mark Half-Day"
            className={row.status === 'half-day' ? 'bg-amber-600 hover:bg-amber-700 text-white border-transparent' : ''}
          >
            <Clock className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
          <Users className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Attendance</h1>
          <p className="text-slate-400 text-sm">Mark staff attendance for today</p>
        </div>
      </div>

      <AdvancedTable
        columns={columns}
        data={data}
        title="Staff List"
        description="Select an action to update staff attendance status."
        searchPlaceholder="Search staff..."
      />
    </div>
  );
};

export default AttendancePage;
