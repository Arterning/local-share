import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppLayout } from "@/components/app-layout"
import { FilesPage } from "@/pages/files-page"
import { TransferPage } from "@/pages/transfer-page"

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/files" replace />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="*" element={<Navigate to="/files" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
