import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_ACADEMIC_YEAR_2026, DEFAULT_SCHOOL_SETTINGS } from '@/lib/database/defaults';
import { isFirebaseConfigured } from '@/lib/database/firebase';
import { listAcademicYears } from '@/repositories/academicRepository';
import { getSchoolSettings } from '@/repositories/settingsAndUsersRepository';
import type { AcademicYear, SchoolSettings } from '@/types/domain';

interface AcademicYearContextValue {
  academicYears: AcademicYear[];
  selectedYearId: string;
  selectedYear: AcademicYear | null;
  setSelectedYearId: (id: string) => void;
  settings: SchoolSettings;
  isLoading: boolean;
  refetchYears: () => void;
  refetchSettings: () => void;
}

const AcademicYearContext = createContext<AcademicYearContextValue | null>(null);
const YEAR_STORAGE_KEY = 'sgae_selected_academic_year';

export const AcademicYearProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [selectedYearId, setSelectedYearIdState] = useState<string>(() => {
    return localStorage.getItem(YEAR_STORAGE_KEY) || '2026';
  });

  const yearsQuery = useQuery({
    queryKey: ['academic-years'],
    queryFn: listAcademicYears,
    enabled: isFirebaseConfigured,
    staleTime: 60_000,
  });

  const settingsQuery = useQuery({
    queryKey: ['school-settings'],
    queryFn: getSchoolSettings,
    enabled: isFirebaseConfigured,
    staleTime: 120_000,
  });

  const academicYears = yearsQuery.data ?? [DEFAULT_ACADEMIC_YEAR_2026];
  const settings = settingsQuery.data ?? DEFAULT_SCHOOL_SETTINGS;

  useEffect(() => {
    if (academicYears.length === 0) return;
    const exists = academicYears.some((y) => y.id === selectedYearId);
    if (!exists) {
      const def =
        academicYears.find((y) => y.isDefault) ||
        academicYears.find((y) => y.status === 'activo') ||
        academicYears[0];
      if (def) {
        setSelectedYearIdState(def.id);
        localStorage.setItem(YEAR_STORAGE_KEY, def.id);
      }
    }
  }, [academicYears, selectedYearId]);

  const setSelectedYearId = (id: string) => {
    setSelectedYearIdState(id);
    localStorage.setItem(YEAR_STORAGE_KEY, id);
  };

  const selectedYear =
    academicYears.find((y) => y.id === selectedYearId) ?? academicYears[0] ?? null;

  return (
    <AcademicYearContext.Provider
      value={{
        academicYears,
        selectedYearId,
        selectedYear,
        setSelectedYearId,
        settings,
        isLoading: yearsQuery.isLoading || settingsQuery.isLoading,
        refetchYears: () => {
          void yearsQuery.refetch();
        },
        refetchSettings: () => {
          void settingsQuery.refetch();
        },
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export function useAcademicYear(): AcademicYearContextValue {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) throw new Error('useAcademicYear debe usarse dentro de AcademicYearProvider');
  return ctx;
}
