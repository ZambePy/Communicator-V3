import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Activity, Frown, Smile, HeartPulse, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { CaregiverPageLayout } from '../../components/ui/CaregiverPageLayout';
import { hoverAndFocusBackground } from '../../components/ui/hoverFocus';
import { PortaoDoPin } from '../../components/ui/PortaoDoPin';

interface Task {
  id: number;
  label: string;
  done: boolean;
}

interface DiaryEntry {
  timestamp: string;
  painLevel: number;
  mood: 'good' | 'bad' | null;
}

interface CaregiverState {
  tasks: Task[];
  entries: DiaryEntry[];
}

const DEFAULT_TASKS: Task[] = [
  { id: 1, label: 'Tomar medicação da manhã', done: false },
  { id: 2, label: 'Fisioterapia (14h)', done: false },
  { id: 3, label: 'Beber 500ml de água', done: false },
];

const storageKey = (userId: string) => `irisflow_caregiver_${userId}`;

const loadState = (userId: string): CaregiverState => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { tasks: DEFAULT_TASKS, entries: [] };
    const parsed = JSON.parse(raw) as Partial<CaregiverState>;
    return {
      tasks: parsed.tasks ?? DEFAULT_TASKS,
      entries: parsed.entries ?? [],
    };
  } catch {
    return { tasks: DEFAULT_TASKS, entries: [] };
  }
};

export const CaregiverDashboard: React.FC = () => {
  const { currentProfile, isCaregiver, loginCaregiver } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const userId = currentProfile?.id ?? 'guest';
  const initial = useMemo(() => loadState(userId), [userId]);

  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [entries, setEntries] = useState<DiaryEntry[]>(initial.entries);
  const [painLevel, setPainLevel] = useState(0);
  const [mood, setMood] = useState<'good' | 'bad' | null>(null);


  useEffect(() => {
    localStorage.setItem(storageKey(userId), JSON.stringify({ tasks, entries }));
  }, [tasks, entries, userId]);

  const toggleTask = (id: number) => {
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  };

  const saveEntry = () => {
    const entry: DiaryEntry = { timestamp: new Date().toISOString(), painLevel, mood };
    setEntries((e) => [entry, ...e].slice(0, 30));
    toast.success('Diário salvo.');
  };

  if (!isCaregiver) {
    return (
      <PortaoDoPin
        titulo="Acesso Restrito ao Cuidador"
        dica="Por favor, digite o PIN numérico do cuidador para acessar o dashboard de atividades e dados clínicos."
        aoEntrar={loginCaregiver}
        mensagemDeErro="PIN inválido"
        aoCancelar={() => navigate('/menu')}
        rotuloCancelar="Voltar"
      />
    );
  }

  return (
    <CaregiverPageLayout title="Painel do Cuidador">
      {/* Bloco de Boas-vindas e Guia do Cuidador */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-base))',
          border: '1px solid var(--color-card-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 className="t-h2" style={{ color: 'var(--color-text-base)', margin: '0 0 0.5rem 0' }}>
            Olá, Cuidador!
          </h3>
          <p style={{ fontSize: '1.05rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
            Certifique-se de que a câmera esteja bem posicionada e o ambiente iluminado para manter o rastreamento ocular calibrado.
          </p>
        </div>
        <button
          onClick={() => navigate('/caregiver/guide?from=/caregiver')}
          style={{
            padding: '0.85rem 1.75rem',
            background: 'var(--state-active-bg)',
            border: '1.5px solid var(--state-hover-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-base)',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          {...hoverAndFocusBackground('var(--state-active-bg)', 'var(--color-primary-light)')}
        >
          Ler Guia do Cuidador
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2rem',
        }}
      >
        <section
          aria-labelledby="tasks-title"
          style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-card-border)',
            padding: '2rem',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <h2
            id="tasks-title"
            className="t-h2"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'var(--color-text-base)',
              marginTop: 0,
            }}
          >
            <Activity color="var(--color-primary)" aria-hidden="true" /> Rotina Diária
          </h2>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              marginTop: '1.5rem',
            }}
          >
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.done}
                  onClick={() => toggleTask(task.id)}
                  aria-label={`${task.done ? 'Desmarcar' : 'Marcar'} tarefa: ${task.label}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1.25rem',
                    borderRadius: '1rem',
                    border: 'none',
                    background: task.done ? 'var(--tint-ok-bg)' : 'var(--color-bg-sunken)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: task.done ? 'inset 0 0 0 2px var(--color-ok)' : 'none',
                    width: '100%',
                    textAlign: 'left',
                    color: task.done ? 'var(--tint-ok-text)' : 'var(--color-text-base)',
                  }}
                >
                  {task.done ? (
                    <CheckCircle2 size={32} color="var(--color-ok)" aria-hidden="true" />
                  ) : (
                    <Circle size={32} color="var(--color-text-faint)" aria-hidden="true" />
                  )}
                  <span
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 600,
                      textDecoration: task.done ? 'line-through' : 'none',
                    }}
                  >
                    {task.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="diary-title"
          style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-card-border)',
            padding: '2rem',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <h2
            id="diary-title"
            className="t-h2"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'var(--color-text-base)',
              marginTop: 0,
            }}
          >
            <HeartPulse color="var(--color-danger)" aria-hidden="true" /> Registro de Sintomas
          </h2>

          <div style={{ marginTop: '2rem' }}>
            <label
              htmlFor="pain-slider"
              style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-muted)' }}
            >
              Nível de Dor Atual: <strong style={{ color: 'var(--color-danger)' }}>{painLevel}</strong>
            </label>
            <input
              id="pain-slider"
              type="range"
              min={0}
              max={10}
              value={painLevel}
              onChange={(e) => setPainLevel(parseInt(e.target.value, 10))}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={painLevel}
              style={{ width: '100%', height: '20px', cursor: 'pointer', marginTop: '0.75rem' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '0.5rem',
                color: 'var(--color-text-faint)',
              }}
            >
              <span>0 (Sem dor)</span>
              <span>10 (Dor máxima)</span>
            </div>
          </div>

          <fieldset style={{ marginTop: '2rem', border: 'none', padding: 0 }}>
            <legend
              style={{
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                marginBottom: '0.75rem',
              }}
            >
              Humor / Bem-Estar
            </legend>
            <div
              role="radiogroup"
              aria-label="Humor atual"
              style={{ display: 'flex', gap: '1rem' }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={mood === 'bad'}
                onClick={() => setMood('bad')}
                style={{
                  flex: 1,
                  padding: '1.5rem',
                  background: mood === 'bad' ? 'var(--tint-danger-bg)' : 'var(--color-bg-sunken)',
                  border: mood === 'bad' ? '2px solid var(--color-danger)' : '2px solid transparent',
                  borderRadius: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--tint-danger-text)',
                }}
              >
                <Frown size={48} color="var(--color-danger)" aria-hidden="true" />
                <span style={{ fontWeight: 700 }}>Mal</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mood === 'good'}
                onClick={() => setMood('good')}
                style={{
                  flex: 1,
                  padding: '1.5rem',
                  background: mood === 'good' ? 'var(--tint-ok-bg)' : 'var(--color-bg-sunken)',
                  border: mood === 'good' ? '2px solid var(--color-ok)' : '2px solid transparent',
                  borderRadius: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--tint-ok-text)',
                }}
              >
                <Smile size={48} color="var(--color-ok)" aria-hidden="true" />
                <span style={{ fontWeight: 700 }}>Bem</span>
              </button>
            </div>
          </fieldset>

          <button
            type="button"
            onClick={saveEntry}
            aria-label="Salvar diário do dia"
            style={{
              width: '100%',
              padding: '1.25rem',
              marginTop: '2rem',
              background: 'var(--color-primary-fill)',
              color: 'var(--color-primary-contrast)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '1.15rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'background 0.2s',
            }}
            {...hoverAndFocusBackground('var(--color-primary-fill)', 'var(--color-primary-dark)')}
          >
            <Save size={20} aria-hidden="true" /> Salvar Diário
          </button>
        </section>

        {entries.length > 0 && (
          <section
            aria-labelledby="history-title"
            style={{
              background: 'var(--color-card-bg)',
              border: '1px solid var(--color-card-border)',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-1)',
              gridColumn: '1 / -1',
            }}
          >
            <h2
              id="history-title"
              style={{ fontSize: '1.35rem', color: 'var(--color-text-base)', marginTop: 0, marginBottom: '1rem', fontWeight: 700 }}
            >
              Histórico recente ({entries.length})
            </h2>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {entries.slice(0, 12).map((e) => (
                <li
                  key={e.timestamp}
                  style={{
                    padding: '1rem',
                    background: 'var(--color-bg-sunken)',
                    borderRadius: '0.75rem',
                    fontSize: '0.95rem',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--color-text-base)', marginBottom: '0.25rem' }}>
                    {new Date(e.timestamp).toLocaleString('pt-BR')}
                  </div>
                  <div>
                    Dor: <strong style={{ color: 'var(--color-danger)' }}>{e.painLevel}/10</strong> · Humor:{' '}
                    <strong style={{ color: e.mood === 'good' ? 'var(--tint-ok-text)' : 'var(--tint-danger-text)' }}>
                      {e.mood === 'good' ? 'Bem' : e.mood === 'bad' ? 'Mal' : 'não registrado'}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </CaregiverPageLayout>
  );
};
