import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, type Profile } from '../../context/AuthContext';
import { UserCircle, UserPlus, ArrowRight, Trash2, AlertCircle, Camera, X } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ProgressoDoOnboarding } from '../../components/ui/ProgressoDoOnboarding';
import { EstadoVazio } from '../../components/ui/EstadoDaTela';

/**
 * Escolha e cadastro do paciente.
 *
 * Antes a lista vinha de três perfis fictícios cravados no código
 * ("Paciente A/B/C") e a rota era órfã: nada navegava para cá. Agora é o
 * último passo antes da calibração, e os perfis são reais — e locais.
 *
 * Nada aqui vai ao servidor. Nome, idade, condição e foto de alguém com ELA
 * são dado de saúde, e o termo aceito na tela anterior promete que ficam nesta
 * máquina.
 */

/** Lado máximo da foto guardada. Uma foto de celular crua estoura a quota. */
const LADO_MAXIMO_PX = 256;

async function reduzirImagem(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    // Sem canvas utilizável (jsdom, por exemplo) guarda o original: uma foto
    // grande é melhor do que perfil sem foto.
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const ProfileSelect: React.FC = () => {
  const { t } = useTranslation();
  const { profiles, selectProfile, createProfile, removeProfile } = useAuth();
  const navigate = useNavigate();

  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [idade, setIdade] = useState('');
  const [condicao, setCondicao] = useState('');
  const [foto, setFoto] = useState<string | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const escolher = (p: Profile) => {
    selectProfile(p);
    navigate('/calibration-check');
  };

  const limpar = () => {
    setCriando(false);
    setNome('');
    setIdade('');
    setCondicao('');
    setFoto(undefined);
    setErro(null);
  };

  const salvar = () => {
    if (nome.trim() === '') {
      setErro(t('profiles.form.nameRequired'));
      return;
    }
    const idadeNum = Number.parseInt(idade, 10);
    createProfile({
      name: nome,
      ...(Number.isFinite(idadeNum) && idadeNum > 0 ? { age: idadeNum } : {}),
      ...(condicao.trim() !== '' ? { condition: condicao } : {}),
      ...(foto ? { avatarDataUrl: foto } : {}),
    });
    limpar();
  };

  const aoEscolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFoto(await reduzirImagem(file));
  };

  return (
    <main
      role="main"
      aria-labelledby="profiles-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        backgroundImage: 'var(--page-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2.5rem 2rem',
      }}
    >
      <ProgressoDoOnboarding atual="perfil" />
      {/* `coluna-livre-da-emergencia`: a 1280×720 o título de 860 px chegava
          por baixo da Emergência quando a página rolava. */}
      <div
        className="animate-fade-in-up coluna-livre-da-emergencia"
        style={{
          '--coluna-largura': '860px',
          width: '100%',
          maxWidth: 860,
          display: 'flex',
          flexDirection: 'column',
          gap: '2.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.6rem',
            textAlign: 'center',
          }}
        >
          <h1 id="profiles-title" className="t-display" style={{ margin: 0, color: 'var(--color-text-base)' }}>
            {t('profiles.title')}
          </h1>
          <p className="t-body-lg" style={{ margin: 0, color: 'var(--color-text-muted)', maxWidth: '48ch' }}>
            {t('profiles.subtitle')}
          </p>
        </div>

        {criando ? (
          <div
            className="surface surface--elevated"
            style={{
              borderRadius: 'var(--radius-xl)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.15rem',
              maxWidth: 560,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <h2 className="t-h2" style={{ margin: 0, color: 'var(--color-text-base)' }}>
              {t('profiles.form.title')}
            </h2>

            <CampoTexto
              id="perfil-nome"
              rotulo={t('profiles.form.name')}
              valor={nome}
              aoMudar={setNome}
              placeholder={t('profiles.form.namePlaceholder')}
            />
            <CampoTexto
              id="perfil-idade"
              rotulo={`${t('profiles.form.age')} (${t('profiles.form.optional')})`}
              valor={idade}
              aoMudar={setIdade}
              tipo="number"
            />
            <CampoTexto
              id="perfil-condicao"
              rotulo={`${t('profiles.form.condition')} (${t('profiles.form.optional')})`}
              valor={condicao}
              aoMudar={setCondicao}
              placeholder={t('profiles.form.conditionPlaceholder')}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, opacity: 0.9 }}>
                {t('profiles.form.photo')} ({t('profiles.form.optional')})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {foto && (
                  <img
                    src={foto}
                    alt=""
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid var(--color-card-border)',
                    }}
                  />
                )}
                <input
                  ref={inputFoto}
                  type="file"
                  accept="image/*"
                  onChange={aoEscolherFoto}
                  style={{ display: 'none' }}
                />
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  onClick={() => inputFoto.current?.click()}
                >
                  <Camera size={17} aria-hidden="true" /> {t('profiles.form.choosePhoto')}
                </PrimaryButton>
                {foto && (
                  <PrimaryButton type="button" variant="ghost" onClick={() => setFoto(undefined)}>
                    <X size={16} aria-hidden="true" /> {t('profiles.form.removePhoto')}
                  </PrimaryButton>
                )}
              </div>
              <span style={{ fontSize: '0.84rem', opacity: 0.7 }}>
                {t('profiles.form.photoHint')}
              </span>
            </div>

            {erro && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  background: 'var(--tint-danger-bg)',
                  border: '1px solid var(--tint-danger-border)',
                  padding: '0.8rem 1rem',
                  borderRadius: '0.85rem',
                  color: 'var(--tint-danger-text)',
                  fontSize: '0.9rem',
                }}
              >
                <AlertCircle size={17} color="var(--color-danger)" aria-hidden="true" />
                <span>{erro}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <PrimaryButton type="button" onClick={salvar}>
                {t('profiles.form.save')}
              </PrimaryButton>
              <PrimaryButton type="button" variant="ghost" onClick={limpar}>
                {t('profiles.form.cancel')}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            {profiles.length === 0 && (
              <EstadoVazio
                titulo={t('profiles.empty')}
                icone={<UserCircle size={32} aria-hidden="true" />}
                style={{ padding: 'var(--space-5)' }}
              />
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 300px))',
                justifyContent: 'center',
                gap: '1.5rem',
              }}
            >
              {profiles.map((p) => (
                <div key={p.id} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    className="surface glass-card"
                    style={{
                      borderRadius: 'var(--radius-xl)',
                      padding: '2rem 1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      width: '100%',
                      color: 'var(--color-text-base)',
                    }}
                  >
                    {p.avatar ? (
                      <img
                        src={p.avatar}
                        alt=""
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '3px solid var(--color-card-border)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: '50%',
                          background: 'var(--color-primary-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <UserCircle size={56} color="var(--color-primary)" aria-hidden="true" />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span className="t-h2" style={{ color: 'var(--color-text-base)' }}>
                        {p.name}
                      </span>
                      {p.condition && (
                        <span className="t-caption">{p.condition}</span>
                      )}
                      <span
                        style={{
                          marginTop: '0.25rem',
                          fontSize: '0.9rem',
                          color: 'var(--color-primary)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        {t('profiles.start')} <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeProfile(p.id)}
                    aria-label={`${t('profiles.remove')} ${p.name}`}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      background: 'var(--color-card-bg)',
                      border: '1px solid var(--color-card-border)',
                      borderRadius: '50%',
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} color="var(--color-danger)" aria-hidden="true" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setCriando(true)}
                style={{
                  background: 'var(--state-active-bg)',
                  border: '2px dashed var(--state-hover-border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '2rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.85rem',
                  cursor: 'pointer',
                  minHeight: 200,
                  color: 'var(--color-primary)',
                }}
              >
                <UserPlus size={40} aria-hidden="true" />
                <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                  {t('profiles.new')}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

const CampoTexto: React.FC<{
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  tipo?: string;
}> = ({ id, rotulo, valor, aoMudar, placeholder, tipo = 'text' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
    <label
      htmlFor={id}
      style={{ fontSize: '0.9rem', fontWeight: 700, opacity: 0.9, color: 'var(--color-text-base)' }}
    >
      {rotulo}
    </label>
    <input
      id={id}
      type={tipo}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      style={{
        border: '1px solid var(--field-border)',
        borderRadius: '0.9rem',
        background: 'var(--field-bg)',
        padding: '0.85rem 1rem',
        fontSize: '1rem',
        outline: 'none',
        color: 'var(--color-text-base)',
        width: '100%',
      }}
    />
  </div>
);
