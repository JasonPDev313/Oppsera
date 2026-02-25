# CardPointe Integrated Payments

## CardPointe Gateway Developer Guide

The following guides provide best practices and other supplemental information for integrating the CardPointe Gateway API.

---

## Running the API in Postman

To help you get started with your integration, you can use the sample CardPointe Gateway API Integration Postman Collection, which includes a template of the API service endpoints.

The CardPointe Gateway API Integration collection also includes a sample Environment to help you get familiar with the API. See [Configuring Your Postman Environment](#configuring-your-postman-environment), below, for more information.

### Configuring Your Postman Environment

Environment variables allow you to autofill select fields with pre-configured values. For example, instead of manually specifying your merchant ID in the body of each request, you can set the `{{merchantid}}` variable to your specific MID.

Once you have received API credentials, you can configure the following variables to auto-fill your merchant-specific data in requests to the CardPointe Gateway API:

- **site** - Set this value to the site for the test or production environment.
- **url** - The `{{url}}` variable is used to set the base url (`https://{{site}}.cardconnect.com/cardconnect/rest/`) for the CardPointe Gateway RESTful web services. `{{site}}` is populated with the value you set for that variable.
- **csurl** - The `{{csurl}}` variable is used to set the url (`https://{{site}}.cardconnect.com/cardsecure/api/v1/ccn/tokenize`) for the CardSecure tokenize REST web service. `{{site}}` is populated with the value you set for that variable.
- **Authorization** - Set this value to the Base64-encoded API credentials that you received. The `{{Authorization}}` variable is used in the header of every request.
- **merchid** - Set this value to your merchant ID (MID). The `{{merchid}}` variable is used in the body of most requests.

These variables are required in the header and body of most requests. The sample environment includes additional variables that you can configure when testing your integration.

Additionally, the sample collection includes test scripts, which gather specific values (such as `token`) from the response body, and dynamically update the corresponding environment variable.

**To configure environment variables, do the following in Postman:**

1. Click the gear icon to open the Manage Environments menu.
2. On the Manage Environments menu, enter your merchant-specific values for each variable.
3. Click **Update**.

See the [Postman user documentation](https://learning.postman.com/) for detailed information on using Postman to test APIs.

---

## Testing Your Integration

This guide provides information to help you develop and test your integrated application. Whether you are developing a new application, or maintaining an existing one, you should incorporate continuous testing in your SDLC.

As we continue to update and improve the CardPointe Gateway, you should regularly schedule regression testing to ensure that your application utilizes and is compatible with applicable changes to the Gateway.

### Getting Started

To get started, contact **integrationdelivery@fiserv.com** to request the following test account details:

- **UAT Merchant ID (MID)** - A UAT test MID that you will use to authenticate requests and access the CardPointe dashboard for reporting.
- **UAT API Credentials** - A set of API credentials provisioned for your UAT MID, which you will use to authenticate your API requests.
- **UAT API URL** - A UAT CardPointe Gateway API URL that you will use to test your API requests.

Once your integration has been validated for production use, you will receive unique credentials for use in the production environment. See the Integration Process Overview for more information.

### Understanding the UAT Environment

You use the UAT (user acceptance testing) sandbox environment to test and validate your application. When you begin your application development and integration, you connect to the UAT instance of the CardPointe Gateway.

To connect to the UAT environment, your application uses the following URL:

```
https://<site>-uat.cardconnect.com/cardconnect/rest/<endpoint>
```

where `<site>` is the site name provided to you, and `<endpoint>` is a CardPointe Gateway service endpoint.

The UAT environment includes emulators that simulate the payment processing activities that occur in production. In this environment, you test with dummy data that is never sent to the payment processor. You should use test card numbers (for example, `4111 1111 1111 1111` or `4444 3333 2222 1111`) and physical test cards.

#### UAT Request Rate Limiting

In the UAT environment, requests to the following endpoints are rate-limited:

- `funding`
- `inquire`
- `profile`
- `settlestat`

Requests to these UAT endpoints are limited to **20 transactions per minute (TPM)**, by IP address.

Responses from these endpoints in the UAT environment include the following rate-limit header fields:

- `X-Rate-Limit-Retry-After-Seconds:` - Returned for unsuccessful HTTP 429 Too Many Requests responses when the limit has been reached. Specifies the seconds remaining before the limit resets.
- `X-Rate-Limit-Remaining:` - Returned for successful HTTP 200 OK responses. Specifies the number of requests available before the limit is reached.

### Understanding UAT Responses

Data that you transmit to the UAT environment is never sent to the payment processing networks; instead, the CardPointe Gateway communicates with an emulator that simulates the payment processor that your merchant ID uses to process payments. The emulator mimics the behavior of the given processing host, and returns a response similar to what you would receive for a live transaction in the production environment.

CardPointe Gateway API responses returned in the UAT environment include fields and arrays in a randomized order. Additionally, UAT responses include dummy fields, arrays, and values. This is intended to help clients develop integrated software that dynamically parses the response data, rather than expecting fields to be present in static positions within the response object.

See **Ensuring Backwards Compatibility** in the API Basics and Best Practices Guide for more information.

Some specific situations, such as a network timeout and specific decline scenarios, require specific input to initiate. See [Test Cases](#test-cases), below, for more information on these specific scenarios.

See **Gateway Response Codes** for a complete list of all possible response codes for the CardPointe Gateway and each processor.

### Using Test Payment Accounts

When testing in the UAT environment, you must use test cards (either physical cards or test card numbers).

> **⚠️ Never use actual cardholder data to test in the UAT environment.**

#### UAT Test Card Data

The UAT Merchant ID is boarded to the First Data North UAT environment. If you are testing with this MID, or your own MID that is boarded to the North or Rapid Connect platform, you can use the following test card data to test card-not-present transactions.

##### UAT Test Card Numbers

You can use the following test card data to test card-not-present payments on the First Data North or Rapid Connect emulator.

Any card number that meets the following requirements and passes Luhn check validation will return an approval response:

| Card Brand | PAN Prefix | PAN Length |
|---|---|---|
| Visa | 4* | 16 |
| Mastercard | 51* through 55* | 16 |
| Amex | 34* or 37* | 15 |
| Discover | 6011*, 622*, 644* through 65* | 16 |
| Diners | 36* | 14 |
| JCB | 35* | 16 |

#### Physical Test Cards

Physical test cards allow you to test card-present payments.

You can obtain a complete set of EMV test cards from B2 Payment Solutions at the following URL:

[https://b2ps.com/product-category/b2-payment-testing-products/](https://b2ps.com/product-category/b2-payment-testing-products/)

You can use any test card to test your integration; you do not need to order Fiserv-branded test cards.

---

## Test Cases

The following topics provide information for testing specific features to obtain responses that are otherwise not returned in the UAT environment.

### Testing with Amount-Driven Response Codes

This feature is available for the following emulators:

- First Data Nashville (NASH) - Auth and Refund
- First Data North (FNOR) - Auth and Refund
- First Data Rapid Connect (RPCT) - Auth and Refund
- Chase Paymentech (PMT) - Auth and Refund
- Paymentech Tampa (PTAM) - Auth
- TSYS (VPS) - Auth
- Vantiv - Auth and Refund

See **Gateway Response Codes** for a complete list of possible response codes for the CardPointe Gateway and each processor.

When testing your CardPointe Gateway or CardPointe Integrated Terminal integration in the UAT environment, you can use amount-driven response codes to emulate processor-specific authorization responses that you might encounter in the production environment. This allows you to receive and handle response codes that you would not otherwise encounter in your test environment.

> All response codes returned in the production environment are received directly from the processor.

To return a specific response code, you make an authorization request with an amount in the **$1000-$1999** range. You specify the desired response code using the last three digits (with a leading 0 for 2-digit response codes) of the whole-dollar amount (the amount excluding cents). For example, if you want to return RPCT respcode 332, "Account locked," make an authorization request for $1332.

> When initiating an authorization request using the First Data Rapid Connect (RPCT) emulator, the amount range will be $1001-$1999.

**Sample Request:**

```json
{
    "amount": "111695",
    "expiry": "1220",
    "account": "4000065433421984",
    "merchid": "496160873888"
}
```

The response includes the RPCT respcode 116, which indicates that the transaction was declined due to insufficient funds.

**Sample Response:**

```json
{
    "amount": "0.00",
    "resptext": "Not sufficient funds",
    "cardproc": "RPCT",
    "respstat": "C",
    "respcode": "116"
}
```

### Testing Refund Authorizations

You can simulate a refund authorization response on the following UAT emulators:

- First Data North (FNOR)
- First Data Rapid Connect (RPCT)
- Chase Paymentech (PMT)

Similarly to testing specific authorization response scenarios using amount-driven responses, you can test individual refund response codes, by sending a partial refund request using an amount value that includes the desired response code.

> Like in Production, UAT transactions cannot be refunded until they have settled, unless the MID is enabled to refund unsettled transactions.

**To test a refund decline, do the following:**

1. Run an authorization request including `"capture":"y"` and `"amount":"2000.00"` or greater.
2. Run a refund request including the `retref` from the authorization response and `"amount":"1nnn.00"`, where `nnn` is the 2 (including leading 0) or 3-digit decline response code you want to receive.

For example, to return a RPCT 500 "Decline" response, include `"amount":"1500.00"` in the refund request.

### Testing Partial Authorizations

You can simulate a partial authorization response on the following UAT emulators:

- First Data North (FNOR)
- First Data Rapid Connect (RPCT)
- Paymentech (Paymentech)
- Paymentech Tampa (PTAM)
- Vantiv (VANT)
- Worldpay (VPS)

To simulate a partial authorization, submit an authorization request using `"account":"4387750101010101"` and `"amount":"6.00"` or greater.

The following responses are returned:

| respproc | respcode | respstat | resptext | amount |
|---|---|---|---|---|
| FNOR | 10 | A | Partial Approval | 5.00 |
| PMT | 100 | A | Approval | 5.00 |
| PTAM | 10 | A | Partial Approval | 5.00 |
| RPCT | 002 | A | Approve for Partial Amount | 5.00 |
| VANT | 10 | A | Partial Approval | 5.00 |
| VPS | 10 | A | Partial Approval | 5.00 |

**Sample Partial Authorization Request:**

```json
{
    "amount": "6.50",
    "expiry": "1220",
    "account": "4387750101010101",
    "merchid": "496160873888"
}
```

**Sample Partial Authorization Response:**

```json
{
    "amount": "5.00",
    "resptext": "Partial Approval",
    "cardproc": "FNOR",
    "respstat": "A",
    "respcode": "10"
}
```

### Testing AVS Response Codes

This feature is available for the following emulators:

- First Data North (FNOR)
- First Data Rapid Connect (RPCT)
- First Data Nashville (NASH)
- Chase Paymentech (PMT)
- Paymentech Tampa (PTAM)
- American Express (AMEX)
- Vantiv (VANT)

In order to test AVS response codes that you will encounter in the production environment, the UAT environment is configured to simulate various AVS responses when the last three characters of the postal code matches a specific value.

To force a specific AVS response, review the UAT Test Zip Codes available in the UAT Test Card Data section of this guide. Then submit an authorization request using the last three characters of the postal code meant to generate that AVS response.

Additionally, including any 3-digit AVS response code within the `address` field will also trigger that response. For example, an authorization request with `"address": "112 Main Street"` or `"address": "31125 Main Street"` will trigger the same AVS response as when using 112 as the last three characters of the postal code.

> To ensure that you receive the intended AVS response, only include a valid 3-digit response value in either the address or postal field, not both.

**Sample Request:**

```json
{
    "merchid": "123456789012",
    "account": "6011000995500000",
    "expiry": "1218",
    "amount": "11.11",
    "address": "123 MAIN STREET",
    "postal": "55112"
}
```

**Sample Response:**

```json
{
    "respstat": "A",
    "token": "9601616143390000",
    "retref": "316336153961",
    "amount": "11.11",
    "expiry": "1218",
    "merchid": "123456789012",
    "respcode": "00",
    "resptext": "Approved",
    "respproc": "FNOR",
    "avsresp": "N"
}
```

The UAT environment also accepts and simulates AVS response codes for alphanumeric postal codes. Be sure to include the `country` field in your request when providing an alphanumeric postal code, as omitting this field will cause the country to default to US and potentially produce unexpected results.

> Note: The following processors do not support AVS for international addresses: American Express (AMEX), Vantiv (VANT).

### Testing Mastercard Merchant Advice Codes

> This feature is only available for the First Data North (FNOR) and First Data Rapid Connect (RPCT) emulators.

For declined recurring payments using a Mastercard account, the issuer returns a Merchant Advice Code, which the merchant can use in conjunction with the processor response to determine the appropriate course of action for handling the decline. The CardPointe Gateway returns these details in the `merchAdviceCode` and `merchAdviceText` fields for declined authorizations on First Data North (FNOR) and First Data Rapid Connect (RPCT).

See **Mastercard Merchant Advice Codes** in the Gateway Response Codes guide for a complete list of response codes and descriptions.

To test the `merchAdviceCode` response scenarios, you must first run an initial transaction with `"cof":"c"`, `"cofscheduled":"y"`, and any amount. Then, run a subsequent transaction with `"cof":"m"`, `"cofscheduled":"y"`, and the amount specified in the table below to return the desired response.

#### First Data North (FNOR) / First Data Rapid Connect (RPCT)

| Card Brand | Test Card Number | Amount (cents) | Processor Response Code (respcode) | Mastercard Merchant Advice Code (merchAdviceCode) | Mastercard Merchant Advice Text (merchAdviceText) |
|---|---|---|---|---|---|
| MASTERCARD | 5442981111111064 | 299901 | 05 | 01 | New account information available |
| MASTERCARD | 5442981111111064 | 299902 | 05 | 02 | Retry after 3 days |
| MASTERCARD | 5442981111111064 | 299903 | 05 | 03 | Account closed |
| MASTERCARD | 5442981111111064 | 299904 | 05 | 04 | Token requirements not fulfilled for this token type |
| MASTERCARD | 5442981111111064 | 299905 | 05 | 05 | Card account closed or fraud |
| MASTERCARD | 5442981111111064 | 299906 | 05 | 06 | Cardholder canceled recurring payment |
| MASTERCARD | 5442981111111064 | 299907 | 05 | 07 | Cancel specific payment |
| MASTERCARD | 5442981111111064 | 299921 | 05 | 21 | Stop recurring for this merchant |
| MASTERCARD | 5442981111111064 | 299922 | 05 | 22 | Merchant does not qualify for product code |
| MASTERCARD | 5442981111111064 | 299924 | 05 | 24 | Retry after 1 hour |
| MASTERCARD | 5442981111111064 | 299925 | 05 | 25 | Retry after 24 hours |
| MASTERCARD | 5442981111111064 | 299926 | 05 | 26 | Retry after 2 days |
| MASTERCARD | 5442981111111064 | 299927 | 05 | 27 | Retry after 4 days |
| MASTERCARD | 5442981111111064 | 299928 | 05 | 28 | Retry after 6 days |
| MASTERCARD | 5442981111111064 | 299929 | 05 | 29 | Retry after 8 days |
| MASTERCARD | 5442981111111064 | 299930 | 05 | 30 | Retry after 10 days |
| MASTERCARD | 5442981111111064 | 299940 | 05 | 40 | Non-reloadable prepaid card |
| MASTERCARD | 5442981111111064 | 299941 | 05 | 41 | Single-use virtual card |
| MASTERCARD | 5442981111111064 | 299943 | 05 | 43 | Consumer multi-use virtual card number |

### Testing Visa Decline Category and Merchant Advice Codes

> This feature is only available for the First Data North (FNOR) and First Data Rapid Connect (RPCT) emulators.

For declined recurring payments using a Visa account, the issuer returns a Decline Category Code and Merchant Advice Code, which the merchant can use in conjunction with the processor response to determine the appropriate course of action for handling the decline. The CardPointe Gateway returns these details in the `declineCategory`, `declineCategoryText`, `merchAdviceCode`, and `merchAdviceText` fields for declined authorizations on First Data North (FNOR) and First Data Rapid Connect (RPCT).

See **Visa Decline Category Codes** and **Mastercard Merchant Advice Codes** in the Gateway Response Codes guide for a complete list of response codes and descriptions.

To test the `merchAdviceCode` response scenarios, you must first run an initial transaction with `"cof":"c"`, `"cofscheduled":"y"`, and any amount. Then, run a subsequent transaction with `"cof":"m"`, `"cofscheduled":"y"`, and the amount specified in the table below to return the desired response.

#### First Data North (FNOR) / First Data Rapid Connect (RPCT)

| Card Brand | Test Account Number | Amount (cents) | Processor Response Code (respcode) | Visa Decline Category Code (declineCategory) | Visa Merchant Advice Code (merchAdviceCode) | Visa Merchant Advice Text (merchAdviceText) |
|---|---|---|---|---|---|---|
| VISA | 4012000000000081 | 299902 | 500 | 1 | 02 | Cardholder blocked this payment |
| VISA | 4012000000000081 | 299903 | 05 | 2 | 03 | Cardholder stopped all recurring for this merchant |
| VISA | 4012000000000081 | 299911 | 05 | 3 | R0 | Stop payment order |
| VISA | 4012000000000081 | 299912 | 05 | 1 | R1 | Revocation of authorization order |
| VISA | 4012000000000081 | 299913 | 05 | 2 | R3 | Revocation of all authorizations order |
| VISA | 4012000000000081 | 299921 | 05 | 3 | 21 | All recurring payments cancelled for this card |

### Testing Association Response Codes

> This feature is only available for the First Data North (FNOR) and First Data Rapid Connect (RPCT) emulators.

The card associations return additional decline details in the `assocRespCode` and `assocRespText` fields for declined authorizations on First Data North (FNOR) and First Data Rapid Connect (RPCT).

See **Association Response Codes** in the Gateway Response Codes guide for a complete list of response codes and descriptions by card brand.

#### VISA Association Response Codes

| Card Number | Amount (cents) | Processor Response Code (respcode) | Association Response Code (assocRespCode) | Association Response Text (assocRespText) |
|---|---|---|---|---|
| 4387751111111012 | 288801 | 54 | 01 | Refer to card issuer |
| 4387751111111012 | 288802 | 54 | 02 | Refer to card issuer - special |
| 4387751111111012 | 288803 | 54 | 03 | Invalid merchant |
| 4387751111111012 | 288804 | 54 | 04 | Pick up card (no fraud) |
| 4387751111111012 | 288805 | 54 | 05 | Do not honor |
| 4387751111111012 | 288806 | 54 | 06 | Error |
| 4387751111111012 | 288807 | 54 | 07 | Pick up card - special |
| 4387751111111012 | 288808 | 54 | 12 | Invalid transaction |
| 4387751111111012 | 288809 | 54 | 13 | Invalid amount |
| 4387751111111012 | 288810 | 54 | 14 | Invalid account number |
| 4387751111111012 | 288811 | 54 | 15 | No such issuer |
| 4387751111111012 | 288812 | 54 | 25 | Unable to locate record in file |
| 4387751111111012 | 288813 | 54 | 28 | File temporarily unavailable |
| 4387751111111012 | 288814 | 54 | 39 | No credit account |
| 4387751111111012 | 288815 | 54 | 41 | Card reported lost |
| 4387751111111012 | 288816 | 54 | 43 | Card reported stolen |
| 4387751111111012 | 288817 | 54 | 46 | Account closed |
| 4387751111111012 | 288818 | 54 | 51 | Insufficient funds |
| 4387751111111012 | 288819 | 54 | 52 | No checking account |
| 4387751111111012 | 288820 | 54 | 53 | No savings account |
| 4387751111111012 | 288821 | 54 | 54 | Wrong expiration |
| 4387751111111012 | 288822 | 54 | 55 | Incorrect PIN |
| 4387751111111012 | 288823 | 54 | 57 | Invalid txn for card |
| 4387751111111012 | 288824 | 54 | 58 | Terminal not permitted |
| 4387751111111012 | 288825 | 54 | 59 | Suspected fraud |
| 4387751111111012 | 288826 | 54 | 61 | Exceeds approval amount limit |
| 4387751111111012 | 288827 | 54 | 62 | Restricted card |
| 4387751111111012 | 288828 | 54 | 63 | Security violation |
| 4387751111111012 | 288829 | 54 | 64 | Transaction does not fulfill AML requirement |
| 4387751111111012 | 288830 | 54 | 65 | Exceeds withdrawal frequency limit |
| 4387751111111012 | 288831 | 54 | 70 | PIN data required |
| 4387751111111012 | 288832 | 54 | 74 | Different value than that used for PIN encryption errors |
| 4387751111111012 | 288833 | 54 | 75 | PIN try exceeded |
| 4387751111111012 | 288834 | 54 | 76 | Unsolicited reversal |
| 4387751111111012 | 288835 | 54 | 78 | Blocked - first used |
| 4387751111111012 | 288836 | 54 | 79 | Already reversed |
| 4387751111111012 | 288837 | 54 | 80 | No financial impact |
| 4387751111111012 | 288838 | 54 | 81 | Cryptographic error found in PIN |
| 4387751111111012 | 288839 | 54 | 82 | Negative CAM dCVV iCVV or CVV results |
| 4387751111111012 | 288840 | 54 | 86 | Cannot verify PIN |
| 4387751111111012 | 288841 | 54 | 89 | Ineligible to receive financial position information (GIV) |
| 4387751111111012 | 288842 | 54 | 91 | Issuer unavailable |
| 4387751111111012 | 288843 | 54 | 92 | Unable to route |
| 4387751111111012 | 288844 | 54 | 93 | Transaction cannot be completed - violation of law |
| 4387751111111012 | 288845 | 54 | 96 | System malfunction |
| 4387751111111012 | 288846 | 54 | 1A | Additional customer authentication required |
| 4387751111111012 | 288847 | 54 | 6P | Verification data failed |
| 4387751111111012 | 288848 | 54 | B1 | Surcharge amount not permitted (U.S. acquirers only) |
| 4387751111111012 | 288849 | 54 | B2 | Surcharge amount not supported by debit network issuer |
| 4387751111111012 | 288850 | 54 | N0 | Force STIP |
| 4387751111111012 | 288851 | 54 | N3 | Cash service not available |
| 4387751111111012 | 288852 | 54 | N4 | Cash request exceeds issuer or approved limit |
| 4387751111111012 | 288853 | 54 | N5 | Ineligible for resubmission |
| 4387751111111012 | 288854 | 54 | N7 | CVV2 failure |
| 4387751111111012 | 288855 | 54 | N8 | Transaction amount exceeded |
| 4387751111111012 | 288856 | 54 | P5 | Denied PIN unblock |
| 4387751111111012 | 288857 | 54 | P6 | Denied PIN change-requested PIN unsafe |
| 4387751111111012 | 288858 | 54 | Q1 | Card Authentication failed |
| 4387751111111012 | 288859 | 54 | R0 | Stop Payment Order |
| 4387751111111012 | 288860 | 54 | R1 | Revocation of authorization order |
| 4387751111111012 | 288861 | 54 | R2 | Transaction does not qualify for Visa PIN |
| 4387751111111012 | 288862 | 54 | R3 | Revocation of all authorizations order |
| 4387751111111012 | 288863 | 54 | Z3 | offline-declined |

#### MASTERCARD Association Response Codes

| Card Number | Amount (cents) | Processor Response Code (respcode) | Association Response Code (assocRespCode) | Association Response Text (assocRespText) |
|---|---|---|---|---|
| 5442981111112021 | 288801 | 54 | 01 | Refer to card issuer |
| 5442981111112021 | 288802 | 54 | 03 | Invalid merchant |
| 5442981111112021 | 288803 | 54 | 05 | Do not honor |
| 5442981111112021 | 288804 | 54 | 12 | Invalid transaction |
| 5442981111112021 | 288805 | 54 | 13 | Invalid amount |
| 5442981111112021 | 288806 | 54 | 14 | Invalid card number |
| 5442981111112021 | 288807 | 54 | 15 | Invalid issuer |
| 5442981111112021 | 288808 | 54 | 30 | Format error |
| 5442981111112021 | 288809 | 54 | 51 | Insufficient funds / over credit limit |
| 5442981111112021 | 288810 | 54 | 54 | Wrong expiration |
| 5442981111112021 | 288811 | 54 | 55 | Incorrect pin |
| 5442981111112021 | 288812 | 54 | 57 | Invalid txn for card |
| 5442981111112021 | 288813 | 54 | 58 | Txn not permitted to cardholder |
| 5442981111112021 | 288814 | 54 | 61 | Exceeds withdrawal limit |
| 5442981111112021 | 288815 | 54 | 62 | Restricted card |
| 5442981111112021 | 288816 | 54 | 63 | Security violation |
| 5442981111112021 | 288817 | 54 | 65 | Exceeds withdrawal frequency |
| 5442981111112021 | 288818 | 54 | 71 | PIN Not Changed |
| 5442981111112021 | 288819 | 54 | 75 | PIN try exceeded |
| 5442981111112021 | 288820 | 54 | 76 | Invalid To Account specified |
| 5442981111112021 | 288821 | 54 | 77 | Invalid From Account specified |
| 5442981111112021 | 288822 | 54 | 78 | Invalid Account specified |
| 5442981111112021 | 288823 | 54 | 81 | Domestic Debit Transaction not allowed |
| 5442981111112021 | 288824 | 54 | 84 | Invalid Authorization Life Cycle |
| 5442981111112021 | 288825 | 54 | 86 | PIN Validation not possible |
| 5442981111112021 | 288826 | 54 | 88 | Cryptographic Failure |
| 5442981111112021 | 288827 | 54 | 89 | Authentication Failure |
| 5442981111112021 | 288828 | 54 | 91 | Issuer or Switch Inoperative |
| 5442981111112021 | 288829 | 54 | 92 | Unable to route transaction |
| 5442981111112021 | 288830 | 54 | 94 | Duplicate Transmission detected |
| 5442981111112021 | 288831 | 54 | 96 | System error |

#### DISCOVER Association Response Codes

| Card Number | Amount (cents) | Processor Response Code (respcode) | Association Response Code (assocRespCode) | Association Response Text (assocRespText) |
|---|---|---|---|---|
| 6011000995512005 | 288801 | 54 | 03 | Invalid Merchant |
| 6011000995512005 | 288802 | 54 | 04 | Capture Card |
| 6011000995512005 | 288803 | 54 | 05 | Do not honor |
| 6011000995512005 | 288804 | 54 | 07 | Pick-up Card special condition |
| 6011000995512005 | 288805 | 54 | 08 | Reserved for future USE |
| 6011000995512005 | 288806 | 54 | 12 | Invalid transaction |
| 6011000995512005 | 288807 | 54 | 13 | Invalid amount |
| 6011000995512005 | 288808 | 54 | 14 | Invalid Card Number |
| 6011000995512005 | 288809 | 54 | 15 | Reserved for future USE |
| 6011000995512005 | 288810 | 54 | 19 | Re-enter transaction |
| 6011000995512005 | 288811 | 54 | 30 | Format error |
| 6011000995512005 | 288812 | 54 | 31 | Bank not supported by switch |
| 6011000995512005 | 288813 | 54 | 38 | Allowable PIN tries exceeded |
| 6011000995512005 | 288814 | 54 | 39 | No credit Account |
| 6011000995512005 | 288815 | 54 | 40 | Requested function not supported |
| 6011000995512005 | 288816 | 54 | 41 | Lost Card |
| 6011000995512005 | 288817 | 54 | 43 | Stolen Card |
| 6011000995512005 | 288818 | 54 | 51 | Decline |
| 6011000995512005 | 288819 | 54 | 53 | No savings Account |
| 6011000995512005 | 288820 | 54 | 54 | Expired Card |
| 6011000995512005 | 288821 | 54 | 55 | Invalid PIN |
| 6011000995512005 | 288822 | 54 | 56 | No Card record |
| 6011000995512005 | 288823 | 54 | 57 | Transaction not permitted to Issuer/Cardholder |
| 6011000995512005 | 288824 | 54 | 58 | Transaction not permitted to Acquirer/terminal |
| 6011000995512005 | 288825 | 54 | 59 | Suspected fraud |
| 6011000995512005 | 288826 | 54 | 60 | Card acceptor contact Acquirer |
| 6011000995512005 | 288827 | 54 | 61 | Exceeds withdrawal amount limit |
| 6011000995512005 | 288828 | 54 | 62 | Restricted Card |
| 6011000995512005 | 288829 | 54 | 63 | Security violation |
| 6011000995512005 | 288830 | 54 | 64 | Original amount incorrect |
| 6011000995512005 | 288831 | 54 | 65 | Exceeds withdrawal count limit |
| 6011000995512005 | 288832 | 54 | 66 | Card Acceptor call Acquirer's security dept |
| 6011000995512005 | 288833 | 54 | 67 | Hard capture (requires ATM pick-up) |
| 6011000995512005 | 288834 | 54 | 68 | Response received too late |
| 6011000995512005 | 288835 | 54 | 75 | Allowable number of PIN tries exceeded |
| 6011000995512005 | 288836 | 54 | 76 | Invalid/nonexistent "to" Account specified |
| 6011000995512005 | 288837 | 54 | 77 | Invalid/nonexistent "from" Account specified |
| 6011000995512005 | 288838 | 54 | 78 | Invalid/nonexistent Account specified (general) |
| 6011000995512005 | 288839 | 54 | 83 | Domain Restriction Controls Failure |
| 6011000995512005 | 288840 | 54 | 85 | No reason to decline |
| 6011000995512005 | 288841 | 54 | 87 | Network unavailable |
| 6011000995512005 | 288842 | 54 | 91 | Authorization system or Issuer system inoperative |
| 6011000995512005 | 288843 | 54 | 92 | Unable to route transaction |
| 6011000995512005 | 288844 | 54 | 93 | Transaction cannot be completed violation of law |
| 6011000995512005 | 288845 | 54 | 94 | Duplicate transmission detected |
| 6011000995512005 | 288846 | 54 | 96 | System malfunction |
| 6011000995512005 | 288847 | 54 | 1A | Customer Authentication Required |
| 6011000995512005 | 288848 | 54 | N1 | System up |
| 6011000995512005 | 288849 | 54 | N2 | Soft down |
| 6011000995512005 | 288850 | 54 | N3 | System down |
| 6011000995512005 | 288851 | 54 | N7 | Decline for AVS or CID mismatch |
| 6011000995512005 | 288852 | 54 | P5 | PIN Change/Unblock failed |
| 6011000995512005 | 288853 | 54 | P6 | New PIN not accepted |

#### AMEX Association Response Codes

| Card Number | Amount (cents) | Processor Response Code (respcode) | Association Response Code (assocRespCode) | Association Response Text (assocRespText) |
|---|---|---|---|---|
| 341111599242008 | 288801 | 54 | 100 | Deny |
| 341111599242008 | 288802 | 54 | 101 | Expired card / Invalid Expiration Date |
| 341111599242008 | 288803 | 54 | 103 | CID failed |
| 341111599242008 | 288804 | 54 | 105 | Card cancelled |
| 341111599242008 | 288805 | 54 | 106 | Exceeded PIN attempts |
| 341111599242008 | 288806 | 54 | 107 | Call issuer |
| 341111599242008 | 288807 | 54 | 109 | Invalid merchant |
| 341111599242008 | 288808 | 54 | 110 | Invalid amount |
| 341111599242008 | 288809 | 54 | 111 | Invalid card / Invalid MICR (Travelers Cheque) |
| 341111599242008 | 288810 | 54 | 115 | Function not supported |
| 341111599242008 | 288811 | 54 | 116 | Insufficient funds |
| 341111599242008 | 288812 | 54 | 117 | Invalid PIN |
| 341111599242008 | 288813 | 54 | 119 | Cardmember not enrolled / not permitted |
| 341111599242008 | 288814 | 54 | 121 | Limit exceeded |
| 341111599242008 | 288815 | 54 | 122 | Invalid CID |
| 341111599242008 | 288816 | 54 | 125 | Invalid effective date |
| 341111599242008 | 288817 | 54 | 130 | Additional customer identification required |
| 341111599242008 | 288818 | 54 | 181 | Format error |
| 341111599242008 | 288819 | 54 | 183 | Invalid currency code |
| 341111599242008 | 288820 | 54 | 187 | Deny - new card issued |
| 341111599242008 | 288821 | 54 | 188 | Deny - canceled |
| 341111599242008 | 288822 | 54 | 189 | Deny - Canceled or Closed Merchant/SE |
| 341111599242008 | 288823 | 54 | 190 | National ID Mismatch |
| 341111599242008 | 288824 | 54 | 193 | Invalid Country Code |
| 341111599242008 | 288825 | 54 | 194 | Invalid Region Code |
| 341111599242008 | 288826 | 54 | 200 | Pick up card |
| 341111599242008 | 288827 | 54 | 900 | Accepted - ATC Synchronization |
| 341111599242008 | 288828 | 54 | 909 | System Malfunction (Cryptographic error) |
| 341111599242008 | 288829 | 54 | 912 | Issuer not available |
| 341111599242008 | 288830 | 54 | 977 | Invalid Payment Plan |
| 341111599242008 | 288831 | 54 | 978 | Invalid Payment Times |

### Testing CardPointe Gateway Timeouts

> This feature is only available for the First Data Rapid Connect (RPCT) and First Data North (FNOR) emulators.

Because the UAT environment does not communicate with the processing hosts, your application can not encounter a time out scenario. In production, when the CardPointe Gateway communication with the processor times out, the Gateway returns an auth response object that includes `"respcode":"62"` and `"resptext":"Timed out"`.

If you want to test your application's ability to handle a time out response, you can send an auth request using one of the following test card numbers:

- **Visa:** `4999006200620062`
- **MC:** `5111006200620062`
- **Discover:** `6465006200620062`

You can also tokenize the card number and use the token in the auth request.

**Example Request:**

```json
{
    "merchid": "496160873888",
    "account": "4999006200620062",
    "expiry": "1223",
    "amount": "5.00",
    "capture": "y"
}
```

**Example Response:**

```
Status: 200 OK
```

```json
{
    "amount": "5.00",
    "resptext": "Timed out",
    "setlstat": "Declined",
    "respcode": "62",
    "merchid": "496160873888",
    "token": "9497267302710062",
    "respproc": "PPS",
    "retref": "343005123105",
    "respstat": "B",
    "account": "9497267302710062"
}
```

---

## Processing Level 2 and Level 3 Transactions

This guide provides information for handling Level 2 and Level 3 transaction data to obtain the best interchange rates for commercial (B2B) and Government (B2G) purchase card transactions. For applicable card types, Visa and Mastercard offer reduced processing costs when transactions meet specific data requirements. Visa and Mastercard monitor applicable transactions to ensure that these requirements are met; when an applicable order does not meet the requirements, the transaction is downgraded, resulting in a higher processing cost (interchange) for the merchant, and a non-compliance report may be issued.

### Understanding Level 1 - Level 3 Data

Each transaction level includes increasingly granular details, requiring additional data to be included in the transaction record.

- **Level 1** order details provide the minimum required details needed to process a transaction, including the seller's merchant ID and the total cost amount and date of the order.
- **Level 2** order details provide the purchaser with additional information about the merchant/seller, as well as tax and purchase order (customer code) details for the order. For purchase or corporate card transactions, Level 2 transaction data can qualify the transaction for a lower processing cost via better interchange rates.
- **Level 3** order and item level details display on the purchaser's bill or invoice to allow the purchaser to match specific goods or services in the order to their records.

The following table lists the transaction details in scope for each level of interchange classification, and their corresponding API parameter names:

| Data Element | API Parameter | Level I | Level II | Level III |
|---|---|---|---|---|
| Merchant Identifier | `merchid` | ✓ | ✓ | ✓ |
| Order Amount (Total) | `amount` | ✓ | ✓ | ✓ |
| Order Date | `orderdate` | ✓ | ✓ | ✓ |
| Merchant Postal Code | N/A* | | ✓ | ✓ |
| Merchant Tax Identification Number (TIN) | N/A* | | ✓ | ✓ |
| Merchant State Code | N/A* | | ✓ | ✓ |
| Tax Exempt | `taxexempt` | | ✓ | ✓ |
| Order Tax Amount | `taxamnt` | | ✓ | ✓ |
| Order Customer Code (Purchase Order Number) | `ponumber` | | ✓ | ✓ |
| Order Ship From (Origin) Postal Code | `shipfromzip` | | | ✓ |
| Order Ship To (Destination) Postal Code | `shiptozip` | | | ✓ |
| Order Ship to Country | `shiptocountry` | | | ✓ |
| Order Freight Amount | `frtamnt` | | | ✓ |
| Order Duty Amount | `dutyamnt` | | | ✓ |
| Order Discount Amount | `discamnt` | | | ✓ |
| Item Universal Product Code (UPC) | `items/upc`** | | | ✓ |
| Item Commodity Code (Material) | `items/material`** | | | ✓ |
| Item Description | `items/description`** | | | ✓ |
| Item Quantity | `items/quantity`** | | | ✓ |
| Item Unit of Measure (UOM) | `items/uom`** | | | ✓ |
| Item Net Cost | `items/netamnt`** | | | ✓ |
| Item Tax Amount | `items/taxamnt`** | | | ✓ |
| Item Discount Amount | `items/discamnt`** | | | ✓ |

\* Automatically derived from the merchant configuration.

\*\* Line item detail, required for each item in the `items` array in the request.

### Level 2 Data

For purchase or corporate card transactions, Level 2 transaction data should be provided in the auth or capture request to qualify for improved interchange rates.

| Field | Size | Type | Comments |
|---|---|---|---|
| `ponumber` | 36 | AN | A customer purchase order number, also referred to as the "Customer Code," which should be an identifier that the customer can use to identify the order. |
| `taxamnt` | 12 | N | The tax amount for the order, either in decimal or in currency minor units (i.e. USD Pennies, MXN Centavos). `taxamnt` must be a non-zero value if `"taxexempt":"N"`, or must be zero (`"0"`) for tax exempt orders (`"taxexempt":"Y"`) or GSA card transactions. |
| `taxexempt` | 1 | AN | Indicates whether or not the order is tax exempt. `taxexempt` should be `Y` if: the payment card BIN type is GSA (government) — *Note: All GSA orders are set to taxexempt regardless of this setting*; or the merchant is a government agency — *in this case, you must include `taxexempt = Y` in the request for each order*. Defaults to `N`. |

**Example Level 2 Authorization Request:**

```json
{
    "merchid": "800000001078",
    "account": "9416285736761111",
    "expiry": "1232",
    "amount": "106.00",
    "taxamnt": "6.00",
    "capture": "Y",
    "name": "Peter Pauper",
    "address": "215 Pennsylvania Ave.",
    "address2": "Apt 6",
    "city": "Philadelphia",
    "region": "PA",
    "postal": "19130",
    "country": "US",
    "phone": "2155552155",
    "email": "tugs@pugs.net",
    "ponumber": "A1B2C3D4",
    "invoiceid": "120393822"
}
```

### Level 3 Data

Level 3 data includes additional order-level details such as freight and discount amount, as well as line item details for each item in the order, which are included as objects within the `items` array.

**Requirements:**

- All orders that qualify for L3 (Purchase or Corporate card) must include L2 parameters (described above) and at least one non-zero-cost item.
- The total of per-item tax amounts must equal the total tax amount for the order.
- The total of per-item costs (item net amount plus tax amount) for all items must equal the settlement amount for the order.
- If the order includes a freight cost (`frtamnt`), you must include an item with `netamnt` equal to the order `frtamnt`.

#### Order Details

| Field | Size | Type | Required | Comments |
|---|---|---|---|---|
| `discamnt` | 12 | N | N | The total discount amount for the order, if applicable. Must equal the sum of the items' `discamnt`. |
| `dutyamnt` | 12 | N | N | The total duty amount for the order, if applicable (non-US orders only). |
| `frtamnt` | 12 | N | N | The total freight amount for the order, if applicable. If the order includes a freight cost, you must include an item with `netamnt` equal to the order `frtamnt`. The freight item description should identify the carrier or terms, for example `"UPS_GROUND100_USCAN"`. |
| `orderdate` | 8 | N | Y | For most industries, the delivery date for the order, in the format `YYYYMMDD`. |
| `shipfromzip` | 12 | AN | Y | The merchant/sender's postal code. Must be 5 or 9 digits if merchant's country is US; otherwise, any alphanumeric string is accepted. |
| `shiptozip` | 12 | AN | Y | The customer/recipient's postal code. Must be 5 or 9 digits if `"shiptocountry":"US"`; otherwise, any alphanumeric string is accepted. |
| `shiptocountry` | 2 | A | N | The customer/recipient's country code. |
| `items` | varies | Array | Y | An array of line item details. See the following table for more information. |

#### Line Item Details

| Field | Size | Type | Required | Comments |
|---|---|---|---|---|
| `description` | 26 | AN | Y | A description for the item. |
| `discamnt` | 12 | N | N | The discount amount for the item, if applicable, as a decimal amount or in currency minor units. The sum of the items' `discamnt` must equal the order `discamnt`. |
| `lineno` | 4 | N | N | An optional line item number for the item. Line numbers do not need to be specified sequentially. |
| `material` | 12 | AN | N | An optional material code for the item. Defaults to none if not specified. |
| `netamnt` | 12 | N | Y | The item's net total cost (`unitcost` x `quantity`), excluding `taxamnt` and `discamnt`, as a decimal amount or in currency minor units. Always a positive value, even for refunds. Zero amounts are allowed for no-charge items. |
| `quantity` | 12 | N | Y | The quantity of the item purchased. Can be a whole amount or amount with up to three decimal places. |
| `taxamnt` | 12 | N | Y | The tax amount for the item. The sum total of `taxamnt` for all items equals the total tax amount for the order. The total of `netamnt + taxamnt - discamnt` equals the order amount. Must be non-zero if `"taxexempt":"N"`, or must be `"0"` for tax exempt orders or GSA card transactions. |
| `unitcost` | 12 | N | Y | The item cost, excluding tax, as a decimal amount or in currency minor units. When omitted, this value is calculated as `netamnt/quantity`. |
| `uom` | 12 | AN | Y | The unit of measure describing the item quantity (for example, `"each"` or `"ton"`). Some processors limit this value to 4 digits. |
| `upc` | 12 | AN | Y | The commodity code or universal product code (UPC) for the item. The value must not be all zeros. Some processors limit this value to 12 characters. |

**Example Level 3 Authorization Request:**

```json
{
    "merchid": "800000001078",
    "account": "9416285736761111",
    "expiry": "1232",
    "amount": "637.60",
    "taxamnt": "33.60",
    "capture": "Y",
    "name": "Peter Pauper",
    "address": "215 Pennsylvania Ave.",
    "address2": "Apt 6",
    "city": "Philadelphia",
    "region": "PA",
    "postal": "19130",
    "country": "US",
    "phone": "2155552155",
    "email": "tugs@pugs.net",
    "ponumber": "A1B2C3D4",
    "shiptozip": "19130",
    "shiptocountry": "US",
    "shipfromzip": "19005",
    "invoiceid": "120393822",
    "orderdate": "20250901",
    "frtamnt": "100.00",
    "discamnt": "56.00",
    "items": [
        {
            "description": "Ergonomic Office Chair",
            "discamnt": "50.00",
            "lineno": "1",
            "material": "43211508",
            "netamnt": "500.00",
            "quantity": "5",
            "taxamnt": "30.00",
            "unitcost": "100.00",
            "uom": "each",
            "upc": "036000291452"
        },
        {
            "description": "UPS_GROUND100_USCAN",
            "discamnt": "0.00",
            "lineno": "2",
            "netamnt": "100.00",
            "taxamnt": "0.00",
            "quantity": "1",
            "unitcost": "100.00"
        },
        {
            "description": "Inkwell Pens",
            "discamnt": "6.00",
            "lineno": "3",
            "material": "654321",
            "netamnt": "60.00",
            "quantity": "10",
            "taxamnt": "3.60",
            "unitcost": "6.00",
            "uom": "each",
            "upc": "001234512345"
        }
    ]
}
```

---

## Processing ACH Payments

This guide provides guidance for accepting Automated Clearing House (ACH) payments using the CardPointe Gateway API. ACH payments, also called e-check payments, are a common payment method for recurring payments as well as telephone and mail orders.

Unlike credit card payments, when a customer authorizes an ACH payment, the funds are withdrawn directly from his or her bank account. This process can take several days, so you should include a monitoring process in your integration to verify the status of the transaction.

To accept ACH payments, you must capture and handle the customer's bank account and routing number. While you can capture this information and pass it directly to the CardPointe Gateway in an authorization request, it is a best practice to instead capture this information and tokenize it using a CardSecure-integrated web form.

### Using a Web Form to Gather and Tokenize ACH Payment Data

To ensure the security of your customers' data, as well as your PCI compliance, it is recommended that you use a customer-facing web form, integrated with CardSecure, to capture and tokenize bank account and routing information.

When using a web form to capture and tokenize customer bank account information, include separate fields for the routing number and account number. Send these fields in a CardSecure tokenization request in the format:

```
"account": "<routing number>/<account number>"
```

For example:

```
"account": "123456789/1234123412341234"
```

CardSecure returns a token representing the ACH account information, which you can then use to make an authorization request to the CardPointe Gateway.

### Making an ACH Authorization Request

To process an ACH payment, you make an authorization request using the CardPointe Gateway API. In addition to the fields required for all authorization requests, you must include the following information:

| Payment Information | Authorization Request Parameter | Description |
|---|---|---|
| Account and Routing Numbers | `account` and `bankaba` | If you gathered and tokenized the customer's bank account and routing information using a CardSecure-integrated web form, then you can pass the token in the `account` field. If you are handling the clear account number and routing number, then include them in the `account` and `bankaba` fields, respectively. |
| Payment Origin | `ecomind` | For ProfitStars ACH transactions, specifies the Standard Entry Class (SEC) code for the transaction. Optionally, include one of the following values (defaults to `E` if not specified): `"T"` - SEC code TEL (Telephone), `"B"` - SEC code PPD (prearranged), `"E"` - SEC code WEB for an Internet or mobile payment. |
| Account Type | `accttype` | Include one of the following values: `"ECHK"` for a checking account, `"ESAV"` for a savings account. |

**Example ACH Authorization Request:**

```http
PUT /cardconnect/rest/auth HTTP/1.1
Host: <site>
Authorization: Basic {base64-encoded credentials}
Content-Type: application/json
```

```json
{
    "merchid": "496160873888",
    "account": "9036412947515678",
    "accttype": "ECHK",
    "amount": "1000",
    "ecomind": "E",
    "capture": "y"
}
```

**Example ACH Successful Response:**

```json
{
    "amount": "10.00",
    "resptext": "Success",
    "cvvresp": "U",
    "respcode": "00",
    "batchid": "1900940972",
    "avsresp": "U",
    "merchid": "542041",
    "token": "9036412947515678",
    "authcode": "VPJSP5",
    "respproc": "PSTR",
    "retref": "353318135488",
    "respstat": "A",
    "account": "9036412947515678"
}
```

### Verifying ACH Transactions

ACH transactions typically take several business days to process and settle, therefore, it is a best practice to periodically check the status of the transaction to ensure that it is successfully processed and that you are credited for the authorized amount.

You can use the CardPointe Gateway API to programmatically verify the transaction status using the `inquire` and `funding` service endpoints.

#### Using the Inquire Endpoint

The `inquire` endpoint provides information on completed authorizations. You can use the `inquire` endpoint if you have the retrieval reference number (`retref`) from the authorization response. If you don't have the `retref`, but you included a unique order ID in the authorization request, then you can use the `inquireByOrderId` endpoint instead.

The inquire response includes a settlement status (`setlstat`) field that displays the settlement status of the transaction. Note that the settlement status initially displays "Queued for Capture" for ACH transactions, and the value is updated once the batch is transmitted. If `"setlstat":"rejected"` you can use the `funding` endpoint to gather more detailed information.

#### Using the Funding Endpoint

The `funding` endpoint provides additional useful information for ACH transactions. Specifically, you can use the `funding` endpoint to retrieve an ACH return code (`achreturncode`), which provides additional information for rejected ACH transactions.

To use the `funding` endpoint, you make a request using the merchant ID and the date of the funding event that included the transaction. The `funding` endpoint returns an array of transaction details for that date.

Use the `retref` for the ACH transaction to locate it in the `txns` node of the response data. For ACH transactions, the response includes an `achreturncode` field that includes a specific code that explains the reason for the rejection.

### ACH Return Codes

The following codes are returned when an ACH transaction is rejected.

| Code | Description |
|---|---|
| R01 | Insufficient funds |
| R02 | Bank account closed |
| R03 | No bank account/unable to locate account |
| R04 | Invalid bank account number |
| R06 | Returned per ODFI request |
| R07 | Authorization revoked by customer |
| R08 | Payment stopped |
| R09 | Uncollected funds |
| R10 | Customer advises not authorized |
| R11 | Check truncation entry return |
| R12 | Branch sold to another RDFI |
| R13 | RDFI not qualified to participate |
| R14 | Representative payee deceased or unable to continue in that capacity |
| R15 | Beneficiary or bank account holder |
| R16 | Bank account frozen |
| R17 | File record edit criteria |
| R18 | Improper effective entry date |
| R19 | Amount field error |
| R20 | Non-payment bank account |
| R21 | Invalid company ID number |
| R22 | Invalid individual ID number |
| R23 | Credit entry refused by receiver |
| R24 | Duplicate entry |
| R25 | Addenda error |
| R26 | Mandatory field error |
| R27 | Trace number error |
| R28 | Transit routing number check digit error |
| R29 | Corporate customer advises not authorized |
| R30 | RDFI not participant in check truncation program |
| R31 | Permissible return entry (CCD and CTX only) |
| R32 | RDFI non-settlement |
| R33 | Return of XCK entry |
| R34 | Limited participation RDFI |
| R35 | Return of improper debit entry |
| R36 | Return of Improper Credit Entry |
| R39 | Improper Source Document |
| R40 | Non-Participant in ENR program |
| R41 | Invalid transaction code |
| R42 | Transit/Routing check digit error |
| R43 | Invalid DFI account number |
| R44 | Invalid individual ID number |
| R45 | Invalid individual name |
| R46 | Invalid representative payee indicator |
| R47 | Duplicate enrollment |
| R50 | State Law affecting RCK Acceptance |
| R51 | Item is Ineligible, Notice Not Provided, Signature Not Genuine, or Item Altered (adjustment entries) |
| R52 | Stop Payment on Item (adjustment entries) |
| R61 | Misrouted return |
| R62 | Incorrect trace number |
| R63 | Incorrect dollar amount |
| R64 | Incorrect individual identification |
| R65 | Incorrect transaction code |
| R66 | Incorrect company identification |
| R67 | Duplicate return |
| R68 | Untimely return |
| R69 | Multiple errors |
| R70 | Permissible return entry not accepted |
| R71 | Misrouted dishonored return |
| R72 | Untimely dishonored return |
| R73 | Timely original return |
| R74 | Corrected return |
| R80 | Cross Border Payment Coding Error |
| R81 | Non-Participant in Cross-Border Program |
| R82 | Invalid Foreign Receiving DFI identification |
| R83 | Foreign Receiving DFI Unable to Settle |

### Testing ACH Authorizations

To test ACH authorizations, you'll need a test merchant account configured to process ACH transactions. Contact **integrationdelivery@fiserv.com**.

When testing ACH transactions, you must use a valid ABA routing number (for example, `036001808` or `011401533`); however, any account number is accepted.

If you test with an invalid routing number, the response returns a `resptext` of `"The RoutingNumber (<bankaba>) is not a valid routing number."`

---

## Scheduling Recurring Payments

This guide provides information for extending your existing CardPointe Gateway API integration to add recurring billing to your payment methods.

To do this, you can use an application scheduler, like Cron, to create a schedule to run recurring transactions. The scheduled job can initiate an authorization request to the CardPointe Gateway using tokenized payment data or a stored profile.

This method gives you complete control over your recurring payment schedule with a simple API integration.

> **⚠️ It is a violation of PCI DSS standards to store Card Verification Value (CVV) data.** Neither the CardPointe Gateway nor the merchant can store this data for the purpose of recurring billing.

> When establishing recurring billing payments or storing and using cardholder payment information for future payments, you must ensure that you obtain the cardholder's consent, and that you comply with the requirements documented in the **Visa and Mastercard Stored Credential Transaction Framework** guide.

### How it Works

The following process provides a general overview of the steps required to set up a recurring payment schedule using the CardPointe Gateway. Depending on your integration and business needs, your procedure may vary.

> Ensure that you review and comply with the card brand requirements for obtaining consent to store and reuse cardholder data. See the **Visa and Mastercard Stored Credential Framework Mandate** guide for detailed information.

**1. Tokenize the customer's payment data.**

Depending on your existing integration, there are several ways to tokenize payment data. For example, you can:

- Gather and tokenize the payment card data using the Hosted iFrame Tokenizer.
- Use a CardPointe Integrated Terminal and the Terminal API `readCard` or `readManual` service endpoint.
- Use the customer's clear PAN or ACH payment data to make a CardPointe Gateway API authorization request. The response returns a token for the account.

> **⚠️** You should only programmatically handle and tokenize clear payment account numbers (PANs) if your business is a registered PCI Level 1 or Level 2 certified merchant.

If using the CardPointe Gateway API, optionally do the following:

- Include `"capture":"y"` to accept an initial payment.
- Include `"profile":"y"` to store the customer's data in a profile to use in future requests. When creating a profile, you must also include `"cofpermission":"y"` to indicate that you have obtained the cardholder's permission to save their payment information.

**2. Store the token for reuse.**

You can either store tokens and customer data in your own database, or you can use the CardPointe Gateway API's `profile` service endpoint to create and store customer profiles in the CardPointe Gateway's secure vault. You can skip this step if you created a profile in step 1.

**3. Gather your billing requirements.**

Determine the start date and length of the billing plan, the payment amount and frequency, and any additional information that you'll need to include in your requests.

**4. Build your Cron job to schedule authorization requests to the CardPointe Gateway API.**

Authorization requests for recurring billing payments must include the following values:

- `"ecomind":"R"` - to flag these authorizations as recurring billing. If this parameter is not set, recurring payments will be declined.
- `"cof":"M"` - to identify these authorizations as merchant-initiated stored credential transactions.
- `"cofscheduled":"Y"` - to identify these as recurring transactions using stored credentials.

**Example Recurring Billing Payment Authorization Using a Stored Profile:**

```http
PUT /cardconnect/rest/auth HTTP/1.1
Host: <site>
Authorization: Basic {base64-encoded credentials}
Content-Type: application/json
```

```json
{
    "merchid": "MID",
    "ecomind": "R",
    "cof": "M",
    "cofscheduled": "Y",
    "profile": "18854390708079407191/1",
    "expiry": "1218",
    "amount": "500",
    "capture": "Y"
}
```

---

## Printing Receipts Using Authorization Data

This guide provides information for integrators who want to use authorization response data to print receipts from an integrated POS printer.

### Receipt Rules and Requirements

This topic provides general best practices and integration details for printing receipts and capturing cardholder signature data; however, each card brand provides specific rules and requirements. You should understand and follow the receipt guidelines for the card brands that you accept.

Consult the following card brand guidelines for detailed information:

- **MasterCard:** [Transaction Processing Rules](https://www.mastercard.us/content/dam/mccom/global/documents/transaction-processing-rules.pdf)
- **Visa:** [Visa Rules](https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf)

Additionally, receipt requirements vary depending on the card type. For example, receipts generated for EMV (chip and contactless) card transactions must include specific EMV tag data returned in the authorization response.

### Understanding Receipt Data

When an authorization is successfully approved and processed by the CardPointe Gateway, the authorization response payload includes important transaction details that you can capture and print on a receipt.

In general, a receipt must include:

- Transaction details from the authorization response
- Merchant account information and additional transaction details returned in the `receipt` object
- EMV tag data returned in the EMV tag object, if the card used was an EMV (chip or contactless) card

#### Authorization Response Data

A successful authorization response includes the following fields (highlighted fields should be included on receipts):

| Field | Content | Max Length | Comments |
|---|---|---|---|
| `respstat` | Status | 1 | Indicates the status of the authorization request. `A` - Approved, `B` - Retry, `C` - Declined |
| `retref` | Retrieval reference number | 12 | CardPointe retrieval reference number from authorization response |
| `account` | Account number | 27 | Masked except for the last four digits |
| `token` | Token | 19 | A token that replaces the card number (if requested) |
| `amount` | Amount | 12 | Authorized amount |
| `batchid` | Batch ID | 12 | Returned for a successful authorization with capture |
| `orderid` | Order ID | 50 | Order ID copied from the authorization request |
| `merchid` | Merchant ID | 12 | If included on a receipt, mask this value except the last four digits |
| `respcode` | Response code | - | Alpha-numeric response code |
| `resptext` | Response text | - | Text description of response |
| `respproc` | Response processor | 4 | Platform and processor abbreviation |
| `bintype` | Type of BIN | 16 | Possible Values: Corp, FSA+Prepaid, GSA+Purchase, Prepaid, Prepaid+Corp, Prepaid+Purchase, Purchase |
| `entrymode` | POS Entry Mode | 25 | Only returned for First Data North and RapidConnect. Possible Values: Keyed, Moto, ECommerce, Recurring, Swipe(Non EMV), DigitalWallet, EMVContact, Contactless, Fallback to Swipe, Fallback to Keyed |
| `avsresp` | AVS response code | 2 | Alpha-numeric AVS response |
| `cvvresp` | CVV response code | 1 | Alpha-numeric CVV response |
| `authcode` | Authorization code | 6 | Authorization Code from the Issuer |
| `signature` | Signature Bitmap | 6144 | JSON escaped, Base64 encoded, Gzipped, BMP file representing the cardholder's signature |
| `commcard` | Commercial card flag | 1 | `Y` if a Corporate or Purchase Card |
| `emv` | Cryptogram | - | Authorization Response Cryptogram (ARPC), returned only when EMV data is present |
| `emvTagData` | EMV tag data | 2000 | A string of receipt and EMV tag data returned from the processor |
| `receipt` | Receipt data | - | An object that includes additional fields to be printed on a receipt |

#### EMV Tag Data

If the card used was an EMV card, the response includes an `emvTagData` object with the following fields:

| Name | Tag | Details | Source | Format | Max Length |
|---|---|---|---|---|---|
| TVR (Terminal Verification Results) | 95 | Status of the different functions as seen from the terminal | Terminal | Binary | 5 |
| ARC (Authorization Response Code) | 8A | Indicates the transaction disposition received from the issuer | Issuer/Terminal | String | 2 |
| PIN (CVM Results) | 9F34 | Indicates the results of the last CVM performed | Terminal | String | 15 |
| Signature (CVM Results) | 9F34 | If "true" then CVM supports signature | Terminal | Boolean | 5 |
| Mode | - | Identifies the mode used to authorize the transaction. Always "Issuer" | CardPointe Gateway | String | 6 |
| TSI (Transaction Status Information) | 9B | Indicates the functions performed in a transaction | Terminal | Binary | 2 |
| Application Preferred Name | 9F12 | Preferred mnemonic associated with the AID | Card | String | 16 |
| AID (Application Identifier, Terminal) | 9F06 | Identifies the application as described in ISO/IEC 7816-5 | Terminal | Binary | 16 |
| IAD (Issuer Application Data) | 9F10 | Contains proprietary application data for transmission to the issuer | Card | Binary | 32 |
| Entry method | - | Indicator identifying how the card information was obtained | Terminal | String | 26 |
| Application Label | 50 | Mnemonic associated with the AID according to ISO/IEC 7816-5 | Card | String | 16 |

#### Receipt Data

The `receipt` object is an optional set of fields that provides additional merchant and order details in the authorization response. To include the `receipt` object, specify `"receipt":"Y"` in the authorization request.

You can specify the following fields in a `userFields` object to include an order note or item details, or to override the merchant properties:

| Field | Description |
|---|---|
| `receiptHeader` | Override the header configured for your MID |
| `receiptFooter` | Override the footer configured for your MID |
| `receiptDba` | Override the DBA name configured for your MID |
| `receiptPhone` | Override the phone number configured for your MID |
| `receiptAddress1` | Override the address (line 1) configured for your MID |
| `receiptAddress2` | Override the address (line 2) configured for your MID |

The `receipt` response object includes the following fields:

| Field | Format | Description |
|---|---|---|
| `header` | AN | A customizable field to display an alphanumeric message |
| `footer` | AN | A customizable field to display an alphanumeric message |
| `dba` | AN | The merchant's Doing Business As (DBA) name |
| `address1` | AN | Line 1 of the merchant's address |
| `address2` | AN | Line 2 of the merchant's address |
| `phone` | N | The merchant's phone number |
| `dateTime` | N | The date and time of the transaction (`YYYYMMDDHHMMSS`) |
| `nameOnCard` | A | The Cardholder's name, if included in the authorization request |

Contact **isvhelpdesk@cardconnect.com** for assistance configuring the receipt printing properties for your merchant account.

---

## Handling Timed-out Transactions

This guide provides best practices for handling CardPointe Gateway API timeout errors. The Gateway API supports synchronous communication; therefore, your application must make requests and expect responses in sync with the CardPointe Gateway services.

### CardPointe Gateway Authorization Timeout (32 Seconds)

When you use the CardPointe Gateway API's `auth` endpoint to make an authorization request, the Gateway sends the request to the payment processing network and allows 31 seconds for a response. If the Gateway does not receive a response, then the request times out at the 32 second mark and returns a "Timed Out" response.

### Handling CardPointe Gateway Timeouts

Whether your application is using the Terminal API `authCard` request, or the CardPointe Gateway API `auth` request, it should be designed to handle the following scenarios:

#### 1. A "Timed out" response returned successfully (HTTP 200)

**Timed Out Response:**

```
Status: 200 OK
```

```json
{
    "amount": "685.00",
    "resptext": "Timed out",
    "setlstat": "Declined",
    "acctid": "1",
    "respcode": "62",
    "merchid": "123456789012",
    "token": "9441282699177251",
    "respproc": "PPS",
    "name": "Jane Doe",
    "currency": "USD",
    "retref": "343005123105",
    "respstat": "B",
    "account": "9419786452781111"
}
```

In this case, a response, including a `retref` for the transaction, is returned. The response includes `"respstat":"B"` which always means "Retry." The transaction attempt should be tried again.

If you need to reference the details of any particular transaction attempt, supply valid `retref` and `merchid` values in an `inquire` request.

> In some cases, retry attempts will also fail. In the event of multiple retry failures, check **status.cardconnect.com** for reports of system-wide issues.

#### 2. No Response Returned

This scenario may include, but is not limited to, an HTTP Status 408 Request Timeout.

In this case, your application cannot determine whether or not the transaction was successful.

As a safeguard against losing record of the transaction attempt from your system, it is strongly recommended that you supply a **unique order ID** for every authorization request made to the API.

If you included an order ID in the original authorization request, then you can use the following Gateway API service endpoints to inquire on or void the transaction record:

**inquireByOrderId** - Used to look up a transaction record using the order ID supplied in the original authorization request. If the original authorization was successful, the response includes the transaction details, including the `retref`. If unsuccessful, the response includes PPS `respcode` 29, "Txn not found."

**voidByOrderId** - Used to look up and void a transaction record using the order ID. `voidByOrderId` should be used in the event that no response is returned by an `inquireByOrderId` request, or if no lookup is required at all.

> **Note:** You should attempt the `voidByOrderId` request three times (3x) to ensure that the transaction is voided, despite not receiving a response to indicate that the request was successful.

See the **CardPointe Gateway API** for information on the `inquireByOrderid`, `voidByOrderId`, and `capture` service endpoints.

---

## Manually Managing Gateway Batches

This guide provides information for using the CardPointe Gateway API's `openbatch` and `closebatch` service endpoints to manually open and close Gateway batches, and the `settlestatByBatchSource` endpoint to retrieve settlement details for a batch.

> The CardPointe Gateway automatically manages transaction batches.

> **⚠️** Exercise caution when managing batches manually. It is possible to group unrelated batches by mistakenly using the same `batchsource`; therefore it is a best practice to use unique batch source values, and to develop a system for categorizing grouped transactions accurately.

### Using the openbatch Endpoint

A call to the `openbatch` service endpoint opens a new batch associated with the supplied `merchid`. The `batchsource` is used to supply a batch identifier to logically link multiple batches together across merchant IDs. A batch contains one `merchid`.

> The `batchsource` value in an `openbatch` request must match the `batchsource` value in the authorization or capture request for the transaction that you want to include in the created batch.

#### openbatch URL

| Method | Request Form | URL | Headers |
|---|---|---|---|
| GET | URL string | `https://<site>.cardconnect.com/cardconnect/rest/openbatch/<merchid>/<batchsource>` | `Authorization: Basic` |

#### openbatch Request

Fields in **bold** are required.

| Field | Type | Comments |
|---|---|---|
| **merchid** | AN | The merchant ID, required in every request. |
| **batchsource** | AN | The batch ID of a third-party system. Use caution when attempting to use `batchsource` to link batches together. |

#### openbatch Response

| Field | Type | Comments |
|---|---|---|
| `batchid` | AN | The batch ID for the new batch, if the request was successful. If `"null"` is returned, the request was not successfully processed. |
| `respcode` | AN | `"success"` if the batch is successfully opened, `"noBatch"` if the request failed. |

**Sample openbatch Response:**

```json
{
    "batchid": "2628",
    "respcode": "success"
}
```

### Using the closebatch Endpoint

A call to the `closebatch` service endpoint attempts to close the batch identified by the `merchid` and `batchid`. Provide a `batchid` to attempt to close a specific batch. If no `batchid` is supplied, the open batch with the lowest `batchid` is closed.

#### closebatch URL

| Method | Request Format | URL | Headers |
|---|---|---|---|
| GET | URL string | `https://<site>.cardconnect.com/cardconnect/rest/closebatch/<merchid>/<batchid>` | `Authorization: Basic` |

#### closebatch Request

Fields in **bold** are required.

| Field | Type | Comments |
|---|---|---|
| **merchid** | AN | The CardPointe merchant ID associated with the batch that you want to close. |
| `batchid` | AN | The batch ID for the batch that you want to close. If no batch ID is specified, the batch with the lowest batch ID number is closed. |

#### closebatch Response

| Field | Type | Comments |
|---|---|---|
| `batchid` | AN | The batch ID of the closed batch. If `"null"` is returned, the request was not successfully processed. |
| `respcode` | AN | `"success"` if the batch is successfully closed, `"noBatch"` if the request failed (the batch does not exist or is already closed). |

**Sample closebatch Response:**

```json
{
    "batchid": "2568",
    "respcode": "success"
}
```

### Using the settlestatByBatchSource Endpoint

A call to the `settlestatByBatchSource` service endpoint returns the settlement status and details for all transactions in a given batch, identified by the `batchsource`.

#### settlestatByBatchSource URL

| Method | Request Format | URL | Headers |
|---|---|---|---|
| POST | JSON object | `https://<site>.cardconnect.com/cardconnect/rest/settlestatByBatchSource` | `Authorization: Basic` |

#### settlestatByBatchSource Request

Fields in **bold** are required.

| Field | Type | Comments |
|---|---|---|
| **merchid** | AN | The CardPointe merchant ID associated with the batch. |
| **batchsource** | AN | The `batchsource` of the batch for which you want to retrieve settlement and transaction details. |

**Sample settlestatByBatchSource Request:**

```json
{
    "merchid": "883000000002",
    "batchsource": "103T662929-20210224"
}
```

#### settlestatByBatchSource Response

| Field | Type | Comments |
|---|---|---|
| `respproc` | AN | An abbreviation that represents the clearing house. |
| `hostbatch` | N | The batch identifier assigned by the payment processor. |
| `chargecnt` | N | The number of "charge" or positive amount transactions in the batch. |
| `batchsource` | AN | The unique `batchsource` identifier for the batch. |
| `refundtotal` | N | The total amount of all refund transactions in the batch, in dollars and cents. |
| `batchid` | AN | The batch ID of the batch. |
| `chargetotal` | N | The total amount of all "charge" or positive amount transactions in the batch, in dollars and cents. |
| `refundcnt` | N | The number of "refund" or negative amount transactions in the batch. |
| `hoststat` | AN | The batch settlement status. One of the following values: Blank (Queued for the processor), `BB` (batch transmitted, all orders rejected), `EB` (batch was empty), `GB` (batch was accepted), `MB` (some accepted, some rejected), `RB` (batch was rejected), `SB` (batch was sent, not yet confirmed), `ND` (batch was sent, no confirmation received within expected timeout window). |
| `merchid` | AN | The CardPointe merchant ID associated with the batch. |
| `txns` | - | An array of JSON objects for each transaction in the batch, including: `setlamount`, `setlstat`, `salesdoc`, `retref`. |

**Example settlestatByBatchSource Response:**

```json
[
    {
        "respproc": "RPCH",
        "hostbatch": "0000000310",
        "chargecnt": 4,
        "batchsource": "103T662929-20210224",
        "refundtotal": "0.00",
        "batchid": "310",
        "chargetotal": "23.00",
        "refundcnt": 0,
        "hoststat": "GB",
        "merchid": "883000000002",
        "txns": [
            {
                "setlamount": "1.00",
                "setlstat": "Y",
                "salesdoc": "101",
                "retref": "055932136909"
            },
            {
                "setlamount": "20.00",
                "setlstat": "Y",
                "salesdoc": "101",
                "retref": "055100236918"
            },
            {
                "setlamount": "1.00",
                "setlstat": "Y",
                "salesdoc": "101",
                "retref": "055933136926"
            },
            {
                "setlamount": "1.00",
                "setlstat": "Y",
                "salesdoc": "101",
                "retref": "055101236934"
            }
        ]
    }
]
```
