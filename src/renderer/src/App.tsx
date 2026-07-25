import { Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import LibraryView from './views/LibraryView'
import ReaderView from './views/ReaderView'
import AnnotationsView from './views/AnnotationsView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'

function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<LibraryView />} />
        <Route path="reader/:bookId" element={<ReaderView />} />
        <Route path="annotations" element={<AnnotationsView />} />
        <Route path="stats" element={<StatsView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  )
}

export default App
