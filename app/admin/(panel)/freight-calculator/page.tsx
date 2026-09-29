'use client';

import { Calculator } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VehicleFreightEstimator } from '@/components/admin/vehicle-freight-estimator';

export default function FreightCalculatorPage() {
  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold">Freight calculator</h1><p className="mt-1 text-sm text-muted-foreground">Estimate RoRo charges by vehicle M³ or compare the full configured 40-ft container price for a country and port.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Calculate shipment costs</CardTitle><CardDescription>Use a saved make/model size or enter the vehicle dimensions. Rates come from Freight charges.</CardDescription></CardHeader><CardContent><VehicleFreightEstimator vehicleTitle="Freight estimate" /></CardContent></Card>
  </div>;
}
