import PageHeader from '../../components/PageHeader';
import StoreShipmentRequestPage from '../shipment/StoreShipmentRequestPage';

export default function InboundDashboardPage() {
  return (
    <div>
      <PageHeader title="종합입고관리" />
      <StoreShipmentRequestPage embedded />
    </div>
  );
}
