import { AppError } from '@oppsera/shared';

export class TableNotFoundError extends AppError {
  constructor(tableId: string) {
    super('TABLE_NOT_FOUND', `Table ${tableId} not found`, 404);
  }
}

export class TableStatusConflictError extends AppError {
  constructor(tableId: string, currentStatus: string, attemptedAction: string) {
    super(
      'TABLE_STATUS_CONFLICT',
      `Cannot ${attemptedAction} table ${tableId} in status '${currentStatus}'`,
      409,
    );
  }
}

export class TableVersionConflictError extends AppError {
  constructor(tableId: string) {
    super(
      'TABLE_VERSION_CONFLICT',
      `Table ${tableId} has been modified by another user (optimistic lock)`,
      409,
    );
  }
}

export class TableNotCombinableError extends AppError {
  constructor(tableId: string) {
    super(
      'TABLE_NOT_COMBINABLE',
      `Table ${tableId} is not marked as combinable`,
      400,
    );
  }
}

export class TableAlreadyCombinedError extends AppError {
  constructor(tableId: string) {
    super(
      'TABLE_ALREADY_COMBINED',
      `Table ${tableId} is already part of a combine group`,
      409,
    );
  }
}

export class CombineGroupNotFoundError extends AppError {
  constructor(groupId: string) {
    super('COMBINE_GROUP_NOT_FOUND', `Combine group ${groupId} not found`, 404);
  }
}

export class RoomNotFoundError extends AppError {
  constructor(roomId: string) {
    super('ROOM_NOT_FOUND', `Room ${roomId} not found`, 404);
  }
}

export class NoPublishedVersionError extends AppError {
  constructor(roomId: string) {
    super(
      'NO_PUBLISHED_VERSION',
      `Room ${roomId} has no published floor plan version`,
      400,
    );
  }
}

export class DuplicateTableNumberError extends AppError {
  constructor(tableNumber: number, roomId: string) {
    super(
      'DUPLICATE_TABLE_NUMBER',
      `Table number ${tableNumber} already exists in room ${roomId}`,
      409,
    );
  }
}

// ── Session 3 Errors ─────────────────────────────────────────────

export class TabNotFoundError extends AppError {
  constructor(tabId: string) {
    super('TAB_NOT_FOUND', `Tab ${tabId} not found`, 404);
  }
}

export class TabStatusConflictError extends AppError {
  constructor(tabId: string, currentStatus: string, attemptedAction: string) {
    super(
      'TAB_STATUS_CONFLICT',
      `Cannot ${attemptedAction} tab ${tabId} in status '${currentStatus}'`,
      409,
    );
  }
}

export class TabVersionConflictError extends AppError {
  constructor(tabId: string) {
    super(
      'TAB_VERSION_CONFLICT',
      `Tab ${tabId} has been modified by another user (optimistic lock)`,
      409,
    );
  }
}

export class CourseNotFoundError extends AppError {
  constructor(tabId: string, courseNumber: number) {
    super(
      'COURSE_NOT_FOUND',
      `Course ${courseNumber} not found for tab ${tabId}`,
      404,
    );
  }
}

export class CourseStatusConflictError extends AppError {
  constructor(courseNumber: number, currentStatus: string, attemptedAction: string) {
    super(
      'COURSE_STATUS_CONFLICT',
      `Cannot ${attemptedAction} course ${courseNumber} in status '${currentStatus}'`,
      409,
    );
  }
}

// ── Session 4 Errors ─────────────────────────────────────────────

export class TicketNotFoundError extends AppError {
  constructor(ticketId: string) {
    super('TICKET_NOT_FOUND', `Kitchen ticket ${ticketId} not found`, 404);
  }
}

export class TicketStatusConflictError extends AppError {
  constructor(ticketId: string, currentStatus: string, attemptedAction: string) {
    super(
      'TICKET_STATUS_CONFLICT',
      `Cannot ${attemptedAction} ticket ${ticketId} in status '${currentStatus}'`,
      409,
    );
  }
}

export class TicketItemNotFoundError extends AppError {
  constructor(itemId: string) {
    super('TICKET_ITEM_NOT_FOUND', `Kitchen ticket item ${itemId} not found`, 404);
  }
}

export class TicketVersionConflictError extends AppError {
  constructor(ticketId: string) {
    super(
      'TICKET_VERSION_CONFLICT',
      `Kitchen ticket ${ticketId} has been modified by another user`,
      409,
    );
  }
}

export class RoutingRuleNotFoundError extends AppError {
  constructor(ruleId: string) {
    super('ROUTING_RULE_NOT_FOUND', `Routing rule ${ruleId} not found`, 404);
  }
}

// ── Session 5 Errors ─────────────────────────────────────────────

export class StationNotFoundError extends AppError {
  constructor(stationId: string) {
    super('STATION_NOT_FOUND', `Kitchen station ${stationId} not found`, 404);
  }
}

export class DuplicateStationNameError extends AppError {
  constructor(name: string) {
    super(
      'DUPLICATE_STATION_NAME',
      `Station name '${name}' already exists at this location`,
      409,
    );
  }
}

export class TicketNotReadyError extends AppError {
  constructor(ticketId: string) {
    super(
      'TICKET_NOT_READY',
      `Not all items on ticket ${ticketId} are ready — cannot bump`,
      400,
    );
  }
}

// ── Session 6 Errors ─────────────────────────────────────────────

export class EightySixLogNotFoundError extends AppError {
  constructor(logId: string) {
    super('EIGHTY_SIX_LOG_NOT_FOUND', `86 log entry ${logId} not found`, 404);
  }
}

export class ItemAlreadyEightySixedError extends AppError {
  constructor(entityId: string) {
    super('ITEM_ALREADY_86D', `Entity ${entityId} is already 86'd`, 409);
  }
}

export class MenuPeriodNotFoundError extends AppError {
  constructor(periodId: string) {
    super('MENU_PERIOD_NOT_FOUND', `Menu period ${periodId} not found`, 404);
  }
}

export class DuplicateMenuPeriodNameError extends AppError {
  constructor(name: string) {
    super('DUPLICATE_MENU_PERIOD_NAME', `Menu period '${name}' already exists at this location`, 409);
  }
}

export class AllergenNotFoundError extends AppError {
  constructor(allergenId: string) {
    super('ALLERGEN_NOT_FOUND', `Allergen ${allergenId} not found`, 404);
  }
}

export class AvailabilityWindowNotFoundError extends AppError {
  constructor(windowId: string) {
    super('AVAILABILITY_WINDOW_NOT_FOUND', `Availability window ${windowId} not found`, 404);
  }
}

// ── Session 7 Errors ─────────────────────────────────────────────

export class PaymentSessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super('PAYMENT_SESSION_NOT_FOUND', `Payment session ${sessionId} not found`, 404);
  }
}

export class PaymentSessionStatusConflictError extends AppError {
  constructor(sessionId: string, currentStatus: string, attemptedAction: string) {
    super(
      'PAYMENT_SESSION_STATUS_CONFLICT',
      `Cannot ${attemptedAction} payment session ${sessionId} in status '${currentStatus}'`,
      409,
    );
  }
}

export class SplitNotAllowedError extends AppError {
  constructor(tabId: string, reason: string) {
    super('SPLIT_NOT_ALLOWED', `Cannot split tab ${tabId}: ${reason}`, 400);
  }
}

export class AutoGratuityRuleNotFoundError extends AppError {
  constructor(ruleId: string) {
    super('AUTO_GRATUITY_RULE_NOT_FOUND', `Auto gratuity rule ${ruleId} not found`, 404);
  }
}

export class CheckAlreadyPaidError extends AppError {
  constructor(orderId: string) {
    super('CHECK_ALREADY_PAID', `Check for order ${orderId} is already fully paid`, 409);
  }
}

export class RefundExceedsTenderError extends AppError {
  constructor(tenderId: string) {
    super('REFUND_EXCEEDS_TENDER', `Refund amount exceeds original tender ${tenderId}`, 400);
  }
}

// ── Session 8 Errors ─────────────────────────────────────────────

export class PreauthNotFoundError extends AppError {
  constructor(preauthId: string) {
    super('PREAUTH_NOT_FOUND', `Pre-auth ${preauthId} not found`, 404);
  }
}

export class PreauthStatusConflictError extends AppError {
  constructor(preauthId: string, currentStatus: string, attemptedAction: string) {
    super(
      'PREAUTH_STATUS_CONFLICT',
      `Cannot ${attemptedAction} pre-auth ${preauthId} in status '${currentStatus}'`,
      409,
    );
  }
}

export class PreauthAmountExceededError extends AppError {
  constructor(preauthId: string, authAmount: number, captureAmount: number) {
    super(
      'PREAUTH_AMOUNT_EXCEEDED',
      `Capture amount ${captureAmount} exceeds pre-auth ${preauthId} authorized amount ${authAmount} beyond threshold`,
      400,
    );
  }
}

export class TipAdjustmentWindowClosedError extends AppError {
  constructor(preauthId: string) {
    super(
      'TIP_ADJUSTMENT_WINDOW_CLOSED',
      `Tip adjustment window has closed for pre-auth ${preauthId}`,
      400,
    );
  }
}

export class TipAlreadyFinalizedError extends AppError {
  constructor(tabId: string) {
    super('TIP_ALREADY_FINALIZED', `Tips for tab ${tabId} are already finalized`, 409);
  }
}

// ── Session 9 Errors ─────────────────────────────────────────────

export class TipPoolNotFoundError extends AppError {
  constructor(poolId: string) {
    super('TIP_POOL_NOT_FOUND', `Tip pool ${poolId} not found`, 404);
  }
}

export class TipPoolParticipantExistsError extends AppError {
  constructor(poolId: string, roleId: string) {
    super(
      'TIP_POOL_PARTICIPANT_EXISTS',
      `Role ${roleId} is already a participant in pool ${poolId}`,
      409,
    );
  }
}

export class TipDeclarationExistsError extends AppError {
  constructor(serverUserId: string, businessDate: string) {
    super(
      'TIP_DECLARATION_EXISTS',
      `Cash tip declaration already exists for server ${serverUserId} on ${businessDate}`,
      409,
    );
  }
}

export class TipDeclarationBelowMinimumError extends AppError {
  constructor(declaredPercentage: string, minimumPercentage: string) {
    super(
      'TIP_DECLARATION_BELOW_MINIMUM',
      `Declared tip percentage ${declaredPercentage}% is below minimum ${minimumPercentage}%`,
      400,
    );
  }
}

// ── Session 10 Errors ─────────────────────────────────────────────

export class CloseBatchNotFoundError extends AppError {
  constructor(closeBatchId: string) {
    super(
      'CLOSE_BATCH_NOT_FOUND',
      `Close batch ${closeBatchId} not found`,
      404,
    );
  }
}

export class CloseBatchStatusConflictError extends AppError {
  constructor(closeBatchId: string, currentStatus: string, expectedStatus: string) {
    super(
      'CLOSE_BATCH_STATUS_CONFLICT',
      `Close batch ${closeBatchId} is ${currentStatus}, expected ${expectedStatus}`,
      409,
    );
  }
}

export class OpenTabsExistError extends AppError {
  constructor(locationId: string, openTabCount: number) {
    super(
      'OPEN_TABS_EXIST',
      `Cannot close batch for location ${locationId}: ${openTabCount} open tab(s) remain`,
      409,
    );
  }
}

export class ServerCheckoutNotFoundError extends AppError {
  constructor(checkoutId: string) {
    super(
      'SERVER_CHECKOUT_NOT_FOUND',
      `Server checkout ${checkoutId} not found`,
      404,
    );
  }
}

export class DepositSlipNotFoundError extends AppError {
  constructor(closeBatchId: string) {
    super(
      'DEPOSIT_SLIP_NOT_FOUND',
      `Deposit slip for close batch ${closeBatchId} not found`,
      404,
    );
  }
}

// ── Session 11 Errors ─────────────────────────────────────────────

export class GlPostingFailedError extends AppError {
  constructor(closeBatchId: string, reason: string) {
    super(
      'GL_POSTING_FAILED',
      `GL posting failed for close batch ${closeBatchId}: ${reason}`,
      500,
    );
  }
}

export class GlMappingNotFoundError extends AppError {
  constructor(entityType: string, entityId: string) {
    super(
      'GL_MAPPING_NOT_FOUND',
      `GL mapping not found for ${entityType} ${entityId}`,
      404,
    );
  }
}

export class BatchAlreadyPostedError extends AppError {
  constructor(closeBatchId: string) {
    super(
      'BATCH_ALREADY_POSTED',
      `Close batch ${closeBatchId} has already been posted to GL`,
      409,
    );
  }
}

export class BatchNotPostedError extends AppError {
  constructor(closeBatchId: string) {
    super(
      'BATCH_NOT_POSTED',
      `Close batch ${closeBatchId} has not been posted to GL — cannot reverse`,
      409,
    );
  }
}

// ── Session 12 Errors ─────────────────────────────────────────────

export class InvalidSettingsModuleKeyError extends AppError {
  constructor(moduleKey: string) {
    super(
      'INVALID_SETTINGS_MODULE_KEY',
      `Invalid F&B settings module key: ${moduleKey}`,
      400,
    );
  }
}

export class InvalidSettingKeyError extends AppError {
  constructor(moduleKey: string, settingKey: string) {
    super(
      'INVALID_SETTING_KEY',
      `Unknown setting key '${settingKey}' for module '${moduleKey}'`,
      400,
    );
  }
}

// ── Session 13 Errors ─────────────────────────────────────────────

export class SoftLockHeldError extends AppError {
  constructor(entityType: string, entityId: string, lockedBy: string) {
    super(
      'SOFT_LOCK_HELD',
      `${entityType} ${entityId} is currently locked by ${lockedBy}`,
      409,
    );
  }
}

export class SoftLockNotFoundError extends AppError {
  constructor(lockId: string) {
    super(
      'SOFT_LOCK_NOT_FOUND',
      `Soft lock ${lockId} not found or expired`,
      404,
    );
  }
}

export class SoftLockExpiredError extends AppError {
  constructor(lockId: string) {
    super(
      'SOFT_LOCK_EXPIRED',
      `Soft lock ${lockId} has expired`,
      410,
    );
  }
}

export class TerminalSessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super(
      'TERMINAL_SESSION_NOT_FOUND',
      `Terminal session ${sessionId} not found`,
      404,
    );
  }
}

// ── Session 14 Errors ─────────────────────────────────────────────

export class PrintJobNotFoundError extends AppError {
  constructor(jobId: string) {
    super('PRINT_JOB_NOT_FOUND', `Print job ${jobId} not found`, 404);
  }
}

export class PrintRoutingRuleNotFoundError extends AppError {
  constructor(ruleId: string) {
    super('PRINT_ROUTING_RULE_NOT_FOUND', `Print routing rule ${ruleId} not found`, 404);
  }
}

export class NoPrinterRoutedError extends AppError {
  constructor(jobType: string, locationId: string) {
    super(
      'NO_PRINTER_ROUTED',
      `No printer routed for job type '${jobType}' at location ${locationId}`,
      400,
    );
  }
}

export class PrintJobAlreadyCompletedError extends AppError {
  constructor(jobId: string) {
    super('PRINT_JOB_ALREADY_COMPLETED', `Print job ${jobId} is already completed`, 409);
  }
}
