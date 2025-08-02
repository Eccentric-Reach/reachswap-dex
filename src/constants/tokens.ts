import { Token } from '../types';

export const TOKENS: Record<string, Token> = {
  LOOP: {
    symbol: 'LOOP',
    name: 'Loop Network',
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    logoUrl: '/Loop_logo-removebg-preview.png'
  },
  wLOOP: {
    symbol: 'wLOOP',
    name: 'Wrapped Loop',
    address: '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5',
    decimals: 18,
    logoUrl: '/wloop_logo-removebg-preview.png'
  },
  GIKO: {
    symbol: 'GIKO',
    name: 'Giko Cat',
    address: '0x0C6E54f51be9A01C10d0c233806B44b0c5EE5bD3',
    decimals: 18,
    logoUrl: '/Giko_Logo-removebg-preview.png'
  },
  KYC: {
    symbol: 'KYC',
    name: 'KYCURITY',
    address: '0x44b9e1C3431E777B446B3ac4A0ec5375a4D26E66',
    decimals: 18,
    logoUrl: '/KYC_Logo-removebg-preview.png'
  },
  LMEME: {
    symbol: 'LMEME',
    name: 'Loop Meme',
    address: '0x992044E352627C8b2C53A50cb23E5C7576Af7D45',
    decimals: 8,
    logoUrl: '/LMEME_Logo-removebg-preview.png'
  },
  ARC: {
    symbol: 'ARC',
    name: 'ARC Technology',
    address: '0x6927568448672477F675D1EAcbfFB20C1E5B7EEC',
    decimals: 18,
    logoUrl: '/ARC_Logo-removebg-preview.png'
  },
  '$44': {
    symbol: '$44',
    name: '$44',
    address: '0x5c450BD14869cCf77C3D935A776B3b0B7792035A',
    decimals: 18,
    logoUrl: '/_44_Logo-removebg-preview.png'
  },
  DOOG: {
    symbol: 'DOOG',
    name: 'Doog',
    address: '0xAd90e7Ad355fB1e19Df909b21B9117b0f56cB222',
    decimals: 18,
    logoUrl: '/DOOG_Logo-removebg-preview.png'
  },
  MAKO: {
    symbol: 'MAKO',
    name: 'Mako Inu',
    address: '0x0260f0bF5362Bc5b1a14A5605Df1Cff6cA4FE72b',
    decimals: 18,
    logoUrl: '/Mako_Logo-removebg-preview.png'
  },
  DRAGON: {
    symbol: 'DRAGON',
    name: 'Dragon Soul',
    address: '0xe350ea6fce40870564da7e96077210d9d412cfec',
    decimals: 18,
    logoUrl: '/DRAGON_logo-removebg-preview.png'
  },
  LSHIB: {
    symbol: 'LSHIB',
    name: 'Loop Shib',
    address: '0xA91b36a561305b7F3A26c890A8afE3c4F719E1AA',
    decimals: 9, // FIXED: LSHIB uses 9 decimals, not 18
    logoUrl: '/Lshib_logo-removebg-preview.png'
  }
};

export const TRADING_PAIRS = [
  'LOOP/wLOOP',
  'LOOP/GIKO',
  'LOOP/KYC',
  'LOOP/LMEME',
  'LOOP/ARC',
  'LOOP/$44',
  'LOOP/DOOG',
  'LOOP/MAKO',
  'LOOP/DRAGON',
  'LOOP/LSHIB'
];