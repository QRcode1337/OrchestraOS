import { useState, useEffect } from 'react'
import VectorGalaxy from '../components/AgentForge/VectorGalaxy'
import MemorySearch from '../components/AgentForge/MemorySearch'
import LeadDashboard from '../components/CASCADE/LeadDashboard'
import { api } from '../lib/api'

type Tab = 'memories' | 'search' | 'cascade'

interface Memory {
  id: string
  agent_id: string
  content: string
  embedding: number[]
  strength: number
  tags: string[]
  created_at: string
  last_accessed: string
}

export default function AgentForgePage() {
  const [activeTab, setActiveTab] = useState<Tab>('memories')
  const [memories, setMemories] = useState<Memory[]>([])
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    checkHealth()
  }, [])

  const checkHealth = async () => {
    try {
      await api.health()
      setConnected(true)
    } catch (error) {
      console.error('Backend not connected:', error)
      setConnected(false)
    }
  }

  const handleSearch = async (query: string, options: any) => {
    const response = await api.memory.search({ query, ...options })
    return response.results
  }

  const handleLoadLeads = async (status?: any) => {
    if (status) {
      const response = await api.cascade.getLeadsByStatus(status)
      return response.leads
    } else {
      const response = await api.cascade.getAllLeads()
      return response.leads
    }
  }

  const handleMemoryClick = (memory: any) => {
    setSelectedMemoryId(memory.id)
    console.log('Memory clicked:', memory)
  }

  const handleResultClick = (result: any) => {
    setSelectedMemoryId(result.id)
    console.log('Search result clicked:', result)
  }

  const handleLeadClick = (lead: any) => {
    console.log('Lead clicked:', lead)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              AgentForge x CASCADE
            </h1>
            <p className="text-sm text-gray-400">
              Persistent Memory & Business Automation Platform
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-400">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-900 border-b border-gray-800 px-4">
        <div className="flex gap-1">
          {[
            { id: 'memories' as Tab, label: 'Vector Galaxy', icon: '🌌' },
            { id: 'search' as Tab, label: 'Memory Search', icon: '🔍' },
            { id: 'cascade' as Tab, label: 'CASCADE Leads', icon: '📞' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!connected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-lg mb-2">Backend server not connected</p>
            <p className="text-sm">Start the server with: npm run dev:server</p>
            <button
              onClick={checkHealth}
              className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'memories' && (
              <VectorGalaxy
                memories={memories}
                onMemoryClick={handleMemoryClick}
                selectedMemoryId={selectedMemoryId}
              />
            )}

            {activeTab === 'search' && (
              <MemorySearch
                onSearch={handleSearch}
                onResultClick={handleResultClick}
              />
            )}

            {activeTab === 'cascade' && (
              <LeadDashboard
                onLoadLeads={handleLoadLeads}
                onLeadClick={handleLeadClick}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
