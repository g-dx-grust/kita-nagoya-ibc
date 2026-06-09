import type { Prisma } from "@prisma/client";

export type EmployeeDefaultWorkTime = {
  employeeId: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
};

export type CurrentEmployeeDefaultWorkTime = {
  id: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultBreakMinutes: number;
};

type EmployeeDefaultWorkTimeClient = Pick<Prisma.TransactionClient, "employee">;

export function changedEmployeeDefaultWorkTimes(
  rows: EmployeeDefaultWorkTime[],
  employees: CurrentEmployeeDefaultWorkTime[],
) {
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  return rows.filter((row) => {
    const employee = employeeMap.get(row.employeeId);
    if (!employee) return true;

    return (
      row.startTime !== employee.defaultStartTime ||
      row.endTime !== employee.defaultEndTime ||
      defaultBreakMinutes(row) !== employee.defaultBreakMinutes
    );
  });
}

export function groupEmployeeDefaultWorkTimes(rows: EmployeeDefaultWorkTime[]) {
  const groups = new Map<string, EmployeeDefaultWorkTime[]>();

  for (const row of rows) {
    const key = `${row.startTime}#${row.endTime}#${defaultBreakMinutes(row)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()];
}

export async function updateEmployeeDefaultWorkTimes(
  tx: EmployeeDefaultWorkTimeClient,
  rows: EmployeeDefaultWorkTime[],
) {
  for (const group of groupEmployeeDefaultWorkTimes(rows)) {
    const first = group[0];
    await tx.employee.updateMany({
      where: { id: { in: group.map((row) => row.employeeId) } },
      data: {
        defaultStartTime: first.startTime,
        defaultEndTime: first.endTime,
        defaultBreakMinutes: defaultBreakMinutes(first),
      },
    });
  }
}

function defaultBreakMinutes(row: EmployeeDefaultWorkTime) {
  return row.breakMinutes ?? 60;
}
