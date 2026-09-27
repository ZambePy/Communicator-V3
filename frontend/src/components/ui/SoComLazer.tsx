import React from 'react';
import { Navigate } from 'react-router-dom';
import { lazerLiberadoPelaLicenca } from '../../services/lazer';

/**
 * Guarda as telas de Lazer e bem-estar (jogos, fotos, leituras, meditação).
 * Sem o recurso no plano, volta para /games, que explica por quê e mostra o
 * caminho de volta — em vez de abrir um jogo que o plano não inclui. O
 * Descanso não passa por aqui: ele tem cartão próprio no menu principal.
 */
export const SoComLazer: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  lazerLiberadoPelaLicenca() ? <>{children}</> : <Navigate to="/games" replace />;
