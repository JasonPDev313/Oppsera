/** Action definition templates — executors registered separately at web app layer */
export const ACTION_TEMPLATES = {
  order_lookup: {
    name: 'order_lookup',
    description:
      'Look up an order by order number or customer name. Returns order status, items, and total.',
    requiredPermission: 'orders.view',
    parameters: {
      type: 'object' as const,
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number to look up (e.g., "ORD-1234")',
        },
        customer_name: {
          type: 'string',
          description: 'Customer name to search orders for',
        },
      },
    },
  },
  inventory_check: {
    name: 'inventory_check',
    description:
      'Check current inventory/stock level for a product by name or SKU.',
    requiredPermission: 'inventory.view',
    parameters: {
      type: 'object' as const,
      properties: {
        product_name: {
          type: 'string',
          description: 'Product name to search for',
        },
        sku: {
          type: 'string',
          description: 'Product SKU code',
        },
      },
    },
  },
  customer_search: {
    name: 'customer_search',
    description:
      'Search for a customer by name, email, or phone number.',
    requiredPermission: 'customers.view',
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query — name, email, or phone number',
        },
      },
      required: ['query'],
    },
  },
  payment_status: {
    name: 'payment_status',
    description:
      'Check payment status for an order or by payment reference.',
    requiredPermission: 'payments.view',
    parameters: {
      type: 'object' as const,
      properties: {
        order_number: {
          type: 'string',
          description: 'Order number to check payment for',
        },
        reference: {
          type: 'string',
          description: 'Payment reference ID',
        },
      },
    },
  },
} as const;
