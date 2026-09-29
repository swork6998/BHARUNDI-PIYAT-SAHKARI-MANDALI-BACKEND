import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// રૂટ હેન્ડલર્સ
import authRoutes from './routes/auth.routes.js';
import mastersRoutes from './routes/masters.routes.js';
import membersRoutes from './routes/members.routes.js';
import ratesRoutes from './routes/rates.routes.js';
import piyatRoutes from './routes/piyat.routes.js';
import sharesRoutes from './routes/shares.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import reportsRoutes from './routes/reports.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ======================================================================================
// CORS સેટઅપ (Cross-Origin Resource Sharing)
// ======================================================================================
// હાલમાં તમામ ડોમેનને પરવાનગી આપેલ છે (origin: '*') જેથી સ્થાનિક ડેવલપમેન્ટ સરળ રહે.
//
// ફોર એક્ઝામ્પલ: પ્રોડક્શન (લાઈવ સર્વર) માં ચોક્કસ ડોમેનને જ મંજૂરી આપવા માટે નીચે મુજબ વાપરવું:
//
// const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000', 'https://bharundipiyat.com'];
// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       callback(new Error('CORS નીતિ દ્વારા આ ડોમેનને મંજૂરી નથી'));
//     }
//   },
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true
// }));
//
// ======================================================================================
app.use(cors({
  origin: '*', // તમામ ડોમેન માટે ખુલ્લું
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// મિડલવેર
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// રૂટ માઉન્ટિંગ
app.use('/api/auth', authRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/rates', ratesRoutes);
app.use('/api/piyat', piyatRoutes);
app.use('/api/shares', sharesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/reports', reportsRoutes);

// બેઝ હેલ્થ ચેક એન્ડપોઇન્ટ
app.get('/api/health', (req, res) => {
  res.json({
    status: 'સક્રિય (OK)',
    app: 'શ્રી ભારૂંડી જૂથ પિયત સહકારી મંડળી લી. API',
    time: new Date().toISOString(),
  });
});

// ગ્લોબલ એરર હેન્ડલર
app.use((err, req, res, next) => {
  console.error('સર્વર ભૂલ:', err.stack);
  res.status(500).json({
    success: false,
    message: 'સર્વરમાં આંતરિક ખામી સર્જાઈ છે: ' + err.message,
  });
});

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 ભારૂંડી પિયત બેકએન્ડ સર્વર પોર્ટ ${PORT} પર શરૂ થયું!`);
  console.log(`📍 હેલ્થ ચેક URL: http://localhost:${PORT}/api/health`);
  console.log(`================================================================`);
});
