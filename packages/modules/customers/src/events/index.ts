export * from './types';
// contracts.ts calls registerContracts() as a side effect on import
import './contracts';
export { handleOrderPlaced, handleOrderVoided, handleTenderRecorded } from './consumers';
