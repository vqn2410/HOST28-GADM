import React, { useEffect, useState } from 'react';
import { Save, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { saveSchoolSettings } from '@/repositories/settingsAndUsersRepository';
import { logAudit } from '@/repositories/auditRepository';
import {
  Button,
  Card,
  FieldLabel,
  Input,
  PageHeader,
  Textarea,
} from '@/components/ui/Primitives';
import type { SchoolSettings } from '@/types/domain';

export const InstitutionSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { settings, refetchSettings } = useAcademicYear();
  const [form, setForm] = useState<SchoolSettings>(settings);
  const [customStatusesText, setCustomStatusesText] = useState(
    (settings.customStudentStatuses ?? []).join(', ')
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
    setCustomStatusesText((settings.customStudentStatuses ?? []).join(', '));
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const customStatuses = customStatusesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await saveSchoolSettings(
        { ...form, customStudentStatuses: customStatuses },
        `${user.apellido}, ${user.nombre}`
      );
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'settings_update',
        entity: 'schoolSettings',
        entityId: 'institution',
        changedFields: ['institutionName', 'cue', 'directorName', 'validationDisclaimer'],
      });
      refetchSettings();
      toast.success('Configuración institucional guardada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar configuración.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Configuración Institucional"
        subtitle="Todos los datos del membrete, certificados PDF, autoridades y leyendas se gestionan desde este panel."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-bold text-ink-primary flex items-center gap-2 pb-2 border-b border-border-subtle">
            <Building2 size={18} className="text-brand-500" /> Identificación del Establecimiento
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel required>Nombre completo de la institución</FieldLabel>
              <Input
                value={form.institutionName}
                onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Número de escuela</FieldLabel>
              <Input
                value={form.schoolNumber}
                onChange={(e) => setForm({ ...form, schoolNumber: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel>CUE</FieldLabel>
              <Input
                value={form.cue}
                onChange={(e) => setForm({ ...form, cue: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>CUE Anexo</FieldLabel>
              <Input
                value={form.cueAnexo}
                onChange={(e) => setForm({ ...form, cueAnexo: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Región educativa</FieldLabel>
              <Input
                value={form.educationRegion}
                onChange={(e) => setForm({ ...form, educationRegion: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel required>Distrito</FieldLabel>
              <Input
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel required>Provincia</FieldLabel>
              <Input
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                required
              />
            </div>
            <div>
              <FieldLabel>Lugar de emisión documental</FieldLabel>
              <Input
                value={form.issuePlace}
                onChange={(e) => setForm({ ...form, issuePlace: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Dirección</FieldLabel>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Teléfono</FieldLabel>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Correo electrónico</FieldLabel>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-bold text-ink-primary pb-2 border-b border-border-subtle">
            Autoridades, Identidad Visual y Leyendas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Director / Directora</FieldLabel>
              <Input
                value={form.directorName}
                onChange={(e) => setForm({ ...form, directorName: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Secretario / Secretaria</FieldLabel>
              <Input
                value={form.secretaryName}
                onChange={(e) => setForm({ ...form, secretaryName: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>URL del Logo institucional</FieldLabel>
              <Input
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Estados adicionales de estudiantes (separados por coma)</FieldLabel>
              <Input
                value={customStatusesText}
                onChange={(e) => setCustomStatusesText(e.target.value)}
                placeholder="Ej. Licencia médica, Intercambio"
              />
            </div>
          </div>
          <div>
            <FieldLabel>Leyenda de validación QR y firma ológrafa</FieldLabel>
            <Textarea
              value={form.validationDisclaimer}
              onChange={(e) => setForm({ ...form, validationDisclaimer: e.target.value })}
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={saving}>
            <Save size={16} /> Guardar configuración institucional
          </Button>
        </div>
      </form>
    </div>
  );
};
