import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { useAcademicYear } from '@/providers/AcademicYearProvider';
import { TEMPLATE_VARIABLES } from '@/lib/database/defaults';
import { listTemplates, saveTemplate } from '@/repositories/certificateRepository';
import { logAudit } from '@/repositories/auditRepository';
import { renderTemplate } from '@/lib/utils/formatters';
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  PageHeader,
  Textarea,
} from '@/components/ui/Primitives';
import type { CertificateTemplate } from '@/types/domain';

export const TemplatesSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { settings } = useAcademicYear();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const [selected, setSelected] = useState<CertificateTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = templatesQuery.data ?? [];
  const active = selected ?? templates[0] ?? null;

  const handleNew = () => {
    const slug = `custom_${Date.now()}`;
    setSelected({
      id: slug,
      code: slug,
      name: 'Nueva constancia institucional',
      title: 'CONSTANCIA INSTITUCIONAL',
      body: `La Dirección de {{nombreInstitucion}} deja constancia de que {{apellidoNombre}}, DNI N.º {{dni}}, cursa {{anio}} año, {{division}} división, turno {{turno}}, ciclo lectivo {{cicloLectivo}}.`,
      footerNote: 'Firma y sello de la autoridad escolar.',
      version: 1,
      active: true,
      updatedAt: '',
      updatedBy: '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !user) return;
    setSaving(true);
    try {
      const saved = await saveTemplate({
        ...active,
        updatedBy: `${user.apellido}, ${user.nombre}`,
      });
      await logAudit({
        userDni: user.dni,
        userName: `${user.apellido}, ${user.nombre}`,
        userRole: user.roleId,
        operation: 'template_update',
        entity: 'certificateTemplates',
        entityId: saved.id,
        newSummary: { name: saved.name, version: saved.version },
      });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelected(saved);
      toast.success(`Plantilla guardada (versión ${saved.version}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const sampleVars: Record<string, string> = {
    apellido: 'Álvarez',
    nombre: 'Martín',
    apellidoNombre: 'Álvarez, Martín',
    dni: '46.123.456',
    anio: '3°',
    division: '1ª',
    turno: 'Mañana',
    cicloLectivo: '2026',
    cicloLectivoDestino: '2027',
    fechaEmision: '25 de noviembre de 2026',
    nombreInstitucion: settings.institutionName,
    numeroEscuela: settings.schoolNumber,
    distrito: settings.district,
    provincia: settings.province,
    cue: settings.cue,
    destinatario: 'ante quien corresponda',
    motivo: 'Acreditación de escolaridad',
    textoPersonalizado: 'Se deja constancia del cumplimiento regular de asistencia.',
    numeroCertificado: '2026-023451',
    token: 'ejemplo_token_seguro',
    urlValidacion: 'https://sgae.institucion.edu.ar/validar/ejemplo',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas Documentales Versionadas"
        subtitle="Editá textos institucionales con variables dinámicas. Cada modificación incrementa la versión preservando los documentos ya emitidos."
        actions={
          <Button size="sm" onClick={handleNew}>
            <Plus size={15} /> Nueva plantilla
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista de plantillas */}
        <Card className="lg:col-span-3 p-3 space-y-1.5">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                active?.id === t.id
                  ? 'bg-brand-500 text-white'
                  : 'hover:bg-surface-subtle text-ink-primary'
              }`}
            >
              <p className="font-bold">{t.name}</p>
              <p className="opacity-75 mt-0.5">
                v{t.version} · {t.code}
              </p>
            </button>
          ))}
        </Card>

        {/* Editor y vista previa */}
        {active && (
          <div className="lg:col-span-9 space-y-5">
            <form onSubmit={handleSave} className="space-y-5">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 size={18} className="text-brand-500" />
                    <h2 className="font-bold text-ink-primary">Editor de Plantilla</h2>
                  </div>
                  <Badge variant="brand">Versión actual: v{active.version}</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Nombre visible</FieldLabel>
                    <Input
                      value={active.name}
                      onChange={(e) => setSelected({ ...active, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel required>Título en el PDF</FieldLabel>
                    <Input
                      value={active.title}
                      onChange={(e) => setSelected({ ...active, title: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel required>Cuerpo de la plantilla</FieldLabel>
                  <Textarea
                    rows={7}
                    value={active.body}
                    onChange={(e) => setSelected({ ...active, body: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-2">
                    Variables dinámicas disponibles (clic para insertar):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setSelected({ ...active, body: `${active.body} ${v}` })
                        }
                        className="px-2 py-1 rounded-lg bg-surface-subtle hover:bg-brand-50 dark:hover:bg-brand-900/40 border border-border-subtle font-mono text-[11px] cursor-pointer"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active.active}
                      onChange={(e) => setSelected({ ...active, active: e.target.checked })}
                    />
                    Plantilla habilitada para emisión
                  </label>
                  <Button type="submit" loading={saving}>
                    <Save size={15} /> Guardar nueva versión (v{active.version + 1})
                  </Button>
                </div>
              </Card>
            </form>

            {/* Vista previa */}
            <Card className="p-6 bg-white text-slate-900">
              <p className="text-xs uppercase font-bold text-brand-600 mb-2">
                Vista previa renderizada con datos de ejemplo
              </p>
              <h3 className="text-center font-bold text-base mb-4">
                {renderTemplate(active.title, sampleVars)}
              </h3>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {renderTemplate(active.body, sampleVars)}
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
