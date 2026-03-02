import { useState, useEffect } from 'react'
import { Modal, Button, Input, Textarea, Select } from '@/shared/components'
import { useToast } from '@/shared/components'
import type { Vendor, VendorChannel, VendorCadence } from '@/types'

const CHANNEL_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'drive', label: 'Google Drive' },
  { value: 'portal', label: 'Portal' },
]

const CADENCE_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'ad-hoc', label: 'Ad-hoc' },
]

export function VendorFormModal({
  open,
  onClose,
  mode,
  vendor,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  vendor: Vendor | null
  onSaved: (data: Partial<Vendor> & { name: string }) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [preferredChannel, setPreferredChannel] = useState<VendorChannel | ''>('')
  const [updateCadence, setUpdateCadence] = useState<VendorCadence | ''>('')
  const [staleAfterDays, setStaleAfterDays] = useState('7')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (vendor) {
      setName(vendor.name)
      setPhone(vendor.phone ?? '')
      setContactName(vendor.contactName ?? '')
      setContactEmail(vendor.contactEmail ?? '')
      setPreferredChannel(vendor.preferredChannel ?? '')
      setUpdateCadence(vendor.updateCadence ?? '')
      setStaleAfterDays(String(vendor.staleAfterDays ?? 7))
      setNotes(vendor.notes ?? '')
    } else {
      setName('')
      setPhone('')
      setContactName('')
      setContactEmail('')
      setPreferredChannel('')
      setUpdateCadence('')
      setStaleAfterDays('7')
      setNotes('')
    }
  }, [vendor, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSaved({
      name: name.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      preferredChannel: preferredChannel || undefined,
      updateCadence: updateCadence || undefined,
      staleAfterDays: parseInt(staleAfterDays) || 7,
    })
    toast.show(mode === 'add' ? 'Vendor added!' : 'Vendor updated!')
    onClose()
  }

  const title = mode === 'add' ? 'Add Vendor' : 'Edit Vendor'
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Vendor Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Contact Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Sales rep name"
          />
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <Input
          label="Contact Email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="vendor@example.com"
        />

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Preferred Channel"
            options={CHANNEL_OPTIONS}
            value={preferredChannel}
            onChange={(e) => setPreferredChannel(e.target.value as VendorChannel | '')}
          />
          <Select
            label="Update Cadence"
            options={CADENCE_OPTIONS}
            value={updateCadence}
            onChange={(e) => setUpdateCadence(e.target.value as VendorCadence | '')}
          />
          <Input
            label="Stale After (days)"
            type="number"
            min="1"
            max="90"
            value={staleAfterDays}
            onChange={(e) => setStaleAfterDays(e.target.value)}
          />
        </div>

        <Textarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        <div className="flex gap-2 pt-2">
          <Button type="submit">
            {mode === 'add' ? 'Save' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
