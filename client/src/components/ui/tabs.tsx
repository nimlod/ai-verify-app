
import React, { useState } from 'react'
type Tab = { id: string, label: string }
export const Tabs: React.FC<{tabs: Tab[], onChange?:(id:string)=>void, value?:string, children: React.ReactNode}> = ({ tabs, onChange, value, children }) => {
  const [active, setActive] = useState(value || tabs[0]?.id)
  const change = (id:string)=>{ setActive(id); onChange?.(id) }
  return (
    <div className="w-full">
      <div className="flex gap-2 mb-4">
        {tabs.map(t=> (
          <button key={t.id} onClick={()=>change(t.id)}
            className={`px-4 py-2 rounded-full text-sm ${active===t.id?'bg-black text-white':'bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div data-active-tab={active}>{children}</div>
    </div>
  )
}
