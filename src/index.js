import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'dataDesk', version: '1.0.0' })
})

app.listen(PORT, () => {
  console.log(`dataDesk backend corriendo en puerto ${PORT}`)
})
